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

const DEFAULT_MODEL = 'gemini-flash-latest'
const MAX_BODY_BYTES = 400_000
const GEMINI_TIMEOUT_MS = 30_000

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
  ) {
    super(message)
  }
}

/** Says which part of the Gemini setup failed without exposing anything secret. */
function modelErrorText(error: ModelError, model: string) {
  const detail = error.detail.toLowerCase()
  if (error.status === 0) return 'Could not reach Gemini. Try again shortly.'
  if (detail.includes('api key') || error.status === 401 || error.status === 403) {
    return 'Gemini rejected the API key. Check GEMINI_API_KEY in Supabase secrets.'
  }
  if (error.status === 402) return 'Gemini credits are used up for this API key. Add credits in Google AI Studio.'
  if (error.status === 404) return `Gemini does not offer the model "${model}". Set GEMINI_MODEL to an available model.`
  if (error.status === 429) return 'Gemini usage limit reached. Wait a minute, or check the quota for this API key.'
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
  const model = Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_MODEL
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
      callModel: (contents) => callGemini({ apiKey: geminiKey, model, systemPrompt, tools, contents }),
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
        JSON.stringify({ event: 'assistant_model_failed', userId, model, status: error.status, message: messageText }),
      )
      return jsonResponse(502, { error: modelErrorText(error, model) }, req)
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
    throw new ModelError(error instanceof Error ? error.message : 'Gemini request failed')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = typeof body?.error?.message === 'string' ? body.error.message : 'no details'
    throw new ModelError(`gemini ${res.status}: ${detail}`, res.status, detail)
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
