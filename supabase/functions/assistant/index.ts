import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import {
  MAX_MESSAGE_CHARS,
  buildSystemPrompt,
  geminiTools,
  parseTranscript,
  runAgent,
  type GeminiContent,
} from '../../../src/lib/assistantAgent.ts'
import { callMcpTool } from '../../../src/mcp/tools.ts'
import type { Database } from '../../../src/types/database.ts'
import { todayInTimeZone } from '../../../src/utils/dates.ts'

/** Tried in order; whatever the key can reach wins. GEMINI_MODEL / GEMINI_MODELS go ahead of these. */
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest']
const NOT_FOR_CHAT = /embedding|image|imagen|veo|tts|audio|live|computer-use|robotics|gemma/
const MAX_BODY_BYTES = 400_000
const GEMINI_TIMEOUT_MS = 30_000
const CATALOG_TIMEOUT_MS = 10_000
/** A minute-rate limit clears quickly; a daily one does not, so stop asking that model today. */
const COOLDOWN_MINUTE_MS = 60_000
const COOLDOWN_DAY_MS = 6 * 60 * 60 * 1000

/** Kept per isolate so one exhausted model does not cost every later request a wasted call. */
const cooldowns = new Map<string, number>()
let catalog: string[] | null = null

type AssistantRequest = {
  transcript?: unknown
  message?: unknown
  approval?: unknown
}

class ModelError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly detail = '',
    readonly model = '',
  ) {
    super(message)
  }
}

/** Says which part of the Gemini setup failed without exposing anything secret. */
function modelErrorText(error: ModelError) {
  const detail = error.detail.toLowerCase()
  if (error.status === 0) return 'Could not reach Gemini. Try again shortly.'
  if (detail.includes('api key') || error.status === 401 || error.status === 403) {
    return 'Gemini rejected the API key. Check GEMINI_API_KEY in Supabase secrets.'
  }
  if (error.status === 402) return 'Gemini credits are used up for this API key. Add credits in Google AI Studio.'
  if (error.status === 429 || error.status === 404) {
    return 'Every Gemini model this key can use is rate limited right now. Try again in a minute.'
  }
  if (error.status === 400) return `Gemini could not read the request: ${error.detail.slice(0, 200)}`
  return `The assistant is unavailable right now (Gemini ${error.status}: ${error.detail.slice(0, 200)}). Try again shortly.`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('Origin')) })
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const geminiKey = Deno.env.get('GEMINI_API_KEY')
  if (!supabaseUrl || !anonKey || !geminiKey) {
    return jsonResponse(503, { error: 'The assistant is not configured yet.' }, req)
  }

  const header = req.headers.get('Authorization') ?? ''
  const db = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await db.auth.getUser()
  if (userError || !userData.user) return jsonResponse(401, { error: 'Not signed in' }, req)
  const userId = userData.user.id

  const raw = await req.text()
  if (raw.length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'This conversation is too long. Start a new chat.' }, req)
  }
  const body = parseBody(raw)
  if (!body) return jsonResponse(400, { error: 'Expected a JSON body' }, req)

  const transcript = parseTranscript(body.transcript)
  if (!transcript) return jsonResponse(413, { error: 'This conversation is too long. Start a new chat.' }, req)
  const message = typeof body.message === 'string' ? body.message : undefined
  if (message && message.length > MAX_MESSAGE_CHARS) {
    return jsonResponse(400, { error: `Keep messages under ${MAX_MESSAGE_CHARS} characters.` }, req)
  }
  const approval =
    body.approval && typeof body.approval === 'object' && typeof (body.approval as { approved?: unknown }).approved === 'boolean'
      ? { approved: (body.approval as { approved: boolean }).approved }
      : undefined

  const profile = await db.from('users').select('timezone').eq('id', userId).maybeSingle()
  const today = todayInTimeZone(profile.data?.timezone || 'UTC')
  const systemPrompt = buildSystemPrompt(today)
  const tools = geminiTools()

  try {
    const result = await runAgent({
      transcript,
      message,
      approval,
      callModel: (contents) => generate({ apiKey: geminiKey, systemPrompt, tools, contents }),
      callTool: (name, args) => callMcpTool(db, userId, name, args),
    })
    console.log(
      JSON.stringify({
        event: 'assistant_turn',
        userId,
        tools: result.toolEvents.map((event) => event.name),
        pending: result.pendingAction?.name ?? null,
      }),
    )
    return jsonResponse(200, result, req)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Request failed'
    if (error instanceof ModelError) {
      console.error(
        JSON.stringify({
          event: 'assistant_model_failed',
          userId,
          model: error.model,
          status: error.status,
          message: messageText,
        }),
      )
      return jsonResponse(502, { error: modelErrorText(error) }, req)
    }
    console.error(JSON.stringify({ event: 'assistant_turn_failed', userId, message: messageText }))
    return jsonResponse(409, { error: messageText }, req)
  }
})

function parseBody(raw: string): AssistantRequest | null {
  try {
    const body = JSON.parse(raw)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as AssistantRequest
  } catch {
    return null
  }
}

type GenerateInput = {
  apiKey: string
  systemPrompt: string
  tools: ReturnType<typeof geminiTools>
  contents: GeminiContent[]
}

function uniqueModels(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
}

function configuredModels() {
  return uniqueModels([
    ...(Deno.env.get('GEMINI_MODEL') ?? '').split(','),
    ...(Deno.env.get('GEMINI_MODELS') ?? '').split(','),
  ])
}

function modelRank(name: string) {
  if (name.includes('flash-lite')) return 1
  if (name.includes('flash')) return 0
  if (name.includes('pro')) return 2
  return 3
}

function modelVersion(name: string) {
  const match = /(\d+(?:\.\d+)?)/.exec(name)
  return match ? Number(match[1]) : 0
}

/** Everyday chat models first, newest first, stable before preview builds. */
function byPreference(a: string, b: string) {
  const preview = (name: string) => (/preview|exp\b|-exp/.test(name) ? 1 : 0)
  return modelRank(a) - modelRank(b) || preview(a) - preview(b) || modelVersion(b) - modelVersion(a) || a.localeCompare(b)
}

/** Asks Gemini what this key can actually call, so quota fallbacks are not guesswork. */
async function discoverModels(apiKey: string) {
  if (catalog) return catalog
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    })
    if (!res.ok) return []
    const body = await res.json()
    const names: string[] = (Array.isArray(body?.models) ? body.models : [])
      .filter((entry: { supportedGenerationMethods?: unknown }) =>
        Array.isArray(entry?.supportedGenerationMethods) && entry.supportedGenerationMethods.includes('generateContent'),
      )
      .map((entry: { name?: unknown }) => String(entry?.name ?? '').replace(/^models\//, ''))
      .filter((name: string) => name.startsWith('gemini') && !NOT_FOR_CHAT.test(name))
    catalog = uniqueModels(names).sort(byPreference)
    return catalog
  } catch {
    return []
  }
}

function coolDown(model: string, error: ModelError) {
  const daily = /per day|per-day|daily|quota_?limit_?value/i.test(error.detail)
  cooldowns.set(model, Date.now() + (error.status === 404 || daily ? COOLDOWN_DAY_MS : COOLDOWN_MINUTE_MS))
}

/** Retryable here means another model might do better: quota, missing model, or a Google-side fault. */
function worthAnotherModel(error: ModelError) {
  return error.status === 429 || error.status === 404 || error.status === 0 || error.status >= 500
}

async function tryModels(models: string[], input: GenerateInput) {
  const now = Date.now()
  const ready = models.filter((model) => (cooldowns.get(model) ?? 0) <= now)
  let lastError: ModelError | null = null
  for (const model of ready) {
    try {
      const content = await callGemini({ ...input, model })
      console.log(JSON.stringify({ event: 'assistant_model_used', model }))
      return { content, lastError }
    } catch (error) {
      if (!(error instanceof ModelError)) throw error
      if (!worthAnotherModel(error)) throw error
      console.warn(JSON.stringify({ event: 'assistant_model_skipped', model, status: error.status }))
      coolDown(model, error)
      lastError = error
    }
  }
  return { content: null, lastError }
}

/** Thought signatures belong to the model that made them, so they cannot survive a fallback. */
function withoutThoughtSignatures(contents: GeminiContent[]): GeminiContent[] {
  return contents.map((content) => ({
    ...content,
    parts: content.parts.map((part) => {
      const copy = { ...part }
      delete copy.thoughtSignature
      return copy
    }),
  }))
}

async function generate(input: GenerateInput): Promise<GeminiContent> {
  try {
    return await attempt(input)
  } catch (error) {
    if (error instanceof ModelError && error.status === 400 && /thought|signature/i.test(error.detail)) {
      return await attempt({ ...input, contents: withoutThoughtSignatures(input.contents) })
    }
    throw error
  }
}

async function attempt(input: GenerateInput): Promise<GeminiContent> {
  const preferred = uniqueModels([...configuredModels(), ...FALLBACK_MODELS])
  const first = await tryModels(preferred, input)
  if (first.content) return first.content

  const rest = (await discoverModels(input.apiKey)).filter((model) => !preferred.includes(model))
  const second = await tryModels(rest, input)
  if (second.content) return second.content

  throw (
    second.lastError ??
    first.lastError ??
    new ModelError('Every model is rate limited', 429, 'all models cooling down', preferred[0] ?? '')
  )
}

async function callGemini(input: {
  apiKey: string
  model: string
  systemPrompt: string
  tools: ReturnType<typeof geminiTools>
  contents: GeminiContent[]
}): Promise<GeminiContent> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.systemPrompt }] },
        contents: input.contents,
        tools: input.tools,
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    })
  } catch (error) {
    throw new ModelError(error instanceof Error ? error.message : 'Gemini request failed', 0, '', input.model)
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof body?.error?.message === 'string' ? body.error.message : 'no details'
    throw new ModelError(`gemini ${res.status}: ${detail}`, res.status, detail, input.model)
  }
  const content = body?.candidates?.[0]?.content
  if (!content || !Array.isArray(content.parts)) {
    const reason = body?.promptFeedback?.blockReason ?? body?.candidates?.[0]?.finishReason ?? 'empty'
    return { role: 'model', parts: [{ text: noReplyText(reason) }] }
  }
  return { role: 'model', parts: content.parts }
}

function noReplyText(reason: string) {
  if (reason === 'SAFETY' || reason === 'BLOCKLIST' || reason === 'PROHIBITED_CONTENT') {
    return "I can't help with that one. Try asking another way."
  }
  return "I didn't get a reply that time. Try again."
}
