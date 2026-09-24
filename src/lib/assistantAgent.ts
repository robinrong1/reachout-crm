import { mcpToolDefinitions } from '../mcp/tools.ts'

export const WRITE_TOOLS = ['create_contact', 'update_contact', 'log_interaction'] as const
export type WriteToolName = (typeof WRITE_TOOLS)[number]

export const MAX_MODEL_STEPS = 6
export const MAX_TRANSCRIPT_CONTENTS = 80
export const MAX_MESSAGE_CHARS = 2000

export type GeminiPart = {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

export type PendingAction = {
  name: WriteToolName
  args: Record<string, unknown>
  /** Current name of the person an update or log refers to, when it could be looked up. */
  contactName?: string
}

export type ToolEvent = {
  name: string
  ok: boolean
  write: boolean
  contactId?: string
  contactName?: string
  error?: string
}

export type AgentResult = {
  transcript: GeminiContent[]
  reply: string | null
  pendingAction: PendingAction | null
  toolEvents: ToolEvent[]
}

export type ToolCaller = (name: string, args: Record<string, unknown>) => Promise<{ text: string; isError: boolean }>
export type ModelCaller = (contents: GeminiContent[]) => Promise<GeminiContent>

export function isWriteTool(name: string): name is WriteToolName {
  return (WRITE_TOOLS as readonly string[]).includes(name)
}

type JsonSchema = Record<string, unknown>

/** Gemini accepts an OpenAPI subset and rejects `additionalProperties`. */
function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'additionalProperties') continue
    if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([prop, inner]) => [prop, toGeminiSchema(inner)]),
      )
      continue
    }
    if (key === 'items' && value && typeof value === 'object') {
      out.items = toGeminiSchema(value as JsonSchema)
      continue
    }
    out[key] = value
  }
  return out
}

export function geminiTools() {
  return [
    {
      functionDeclarations: mcpToolDefinitions().map((tool) => {
        const parameters = toGeminiSchema(tool.inputSchema as JsonSchema)
        const hasProperties = Object.keys((parameters.properties as object | undefined) ?? {}).length > 0
        return hasProperties
          ? { name: tool.name, description: tool.description, parameters }
          : { name: tool.name, description: tool.description }
      }),
    },
  ]
}

export function buildSystemPrompt(today: string) {
  return [
    'You are the assistant inside Reach, a personal relationship app. Reach helps people keep in touch with friends, family, and colleagues. It is not a sales CRM: never talk about leads, pipelines, or deals.',
    `Today is ${today} in the user's timezone. Resolve relative dates like "yesterday" or "last Friday" to YYYY-MM-DD.`,
    'Use the tools to look things up and make changes. Before updating someone or logging a conversation, call find_contacts to get their id. Never guess or invent an id. If several people match, ask which one.',
    'Changes (create_contact, update_contact, log_interaction) are shown to the user for approval before they run. Propose one change at a time. If the user declines, do not retry the same change; ask what they want instead.',
    'You cannot delete people. To stop tracking someone, suggest archiving them.',
    'Cadence is how often the user wants to be in touch, in days: weekly is 7, monthly is 30, quarterly is 90.',
    'Keep replies short and warm. Use plain sentences, not tables. Do not show ids to the user.',
  ].join('\n\n')
}

/** Transcripts round-trip through the browser, so only well-formed turns are accepted. */
export function parseTranscript(value: unknown): GeminiContent[] | null {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > MAX_TRANSCRIPT_CONTENTS) return null
  const contents: GeminiContent[] = []
  for (const item of value) {
    const record = asRecord(item)
    if (record.role !== 'user' && record.role !== 'model') return null
    if (!Array.isArray(record.parts) || record.parts.length === 0) return null
    if (!record.parts.every((part) => part && typeof part === 'object' && !Array.isArray(part))) return null
    contents.push({ role: record.role, parts: record.parts as GeminiPart[] })
  }
  return contents
}

function parseToolText(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function functionCalls(content: GeminiContent | undefined) {
  if (!content || content.role !== 'model') return []
  return content.parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []))
}

function replyText(content: GeminiContent) {
  const text = content.parts
    .filter((part) => typeof part.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim()
  return text || null
}

/** The write call awaiting approval: the first write in a trailing model turn that has no responses yet. */
export function pendingCall(transcript: GeminiContent[]) {
  return functionCalls(transcript.at(-1)).find((call) => isWriteTool(call.name)) ?? null
}

function contactFromResult(name: string, result: unknown): Pick<ToolEvent, 'contactId' | 'contactName'> {
  const record = asRecord(result)
  if (name === 'log_interaction') {
    return typeof record.contact_id === 'string' ? { contactId: record.contact_id } : {}
  }
  if (name === 'create_contact' || name === 'update_contact') {
    return {
      contactId: typeof record.id === 'string' ? record.id : undefined,
      contactName: typeof record.name === 'string' ? record.name : undefined,
    }
  }
  return {}
}

async function runCall(
  call: NonNullable<GeminiPart['functionCall']>,
  callTool: ToolCaller,
  events: ToolEvent[],
): Promise<GeminiPart> {
  const args = asRecord(call.args)
  const result = await callTool(call.name, args)
  const write = isWriteTool(call.name)
  if (result.isError) {
    events.push({ name: call.name, ok: false, write, error: result.text })
    return { functionResponse: { id: call.id, name: call.name, response: { error: result.text } } }
  }
  const parsed = parseToolText(result.text)
  events.push({ name: call.name, ok: true, write, ...contactFromResult(call.name, parsed) })
  return { functionResponse: { id: call.id, name: call.name, response: { result: parsed } } }
}

function skipped(call: NonNullable<GeminiPart['functionCall']>, reason: string): GeminiPart {
  return { functionResponse: { id: call.id, name: call.name, response: { error: reason } } }
}

async function lookupContactName(args: Record<string, unknown>, callTool: ToolCaller) {
  const id = typeof args.id === 'string' ? args.id : typeof args.contact_id === 'string' ? args.contact_id : ''
  if (!id) return undefined
  const found = await callTool('get_contact', { id })
  if (found.isError) return undefined
  const name = asRecord(asRecord(parseToolText(found.text)).contact).name
  return typeof name === 'string' ? name : undefined
}

async function toPending(
  call: NonNullable<GeminiPart['functionCall']>,
  callTool: ToolCaller,
): Promise<PendingAction> {
  const args = asRecord(call.args)
  const name = call.name as WriteToolName
  if (name === 'create_contact') return { name, args }
  return { name, args, contactName: await lookupContactName(args, callTool) }
}

/** Appends a user message, merging into a trailing user turn so turns keep alternating. */
function withUserText(transcript: GeminiContent[], message: string): GeminiContent[] {
  const last = transcript.at(-1)
  if (last?.role === 'user') {
    return [...transcript.slice(0, -1), { role: 'user', parts: [...last.parts, { text: message }] }]
  }
  return [...transcript, { role: 'user', parts: [{ text: message }] }]
}

export type RunAgentInput = {
  transcript: GeminiContent[]
  message?: string
  approval?: { approved: boolean }
  callModel: ModelCaller
  callTool: ToolCaller
}

export async function runAgent(input: RunAgentInput): Promise<AgentResult> {
  const { callModel, callTool } = input
  const events: ToolEvent[] = []
  let transcript = [...input.transcript]
  const pending = pendingCall(transcript)

  if (pending) {
    if (!input.approval) throw new Error('Approve or cancel the pending change first')
    const responses: GeminiPart[] = []
    for (const call of functionCalls(transcript.at(-1))) {
      if (call === pending) {
        responses.push(
          input.approval.approved
            ? await runCall(call, callTool, events)
            : skipped(call, 'The user declined this change. It was not made.'),
        )
      } else if (isWriteTool(call.name)) {
        responses.push(skipped(call, 'Not run. Propose one change at a time.'))
      } else {
        responses.push(await runCall(call, callTool, events))
      }
    }
    transcript.push({ role: 'user', parts: responses })
  } else if (input.approval) {
    throw new Error('There is no change waiting for approval')
  }

  const message = input.message?.trim()
  if (message) transcript = withUserText(transcript, message)
  if (transcript.at(-1)?.role !== 'user') throw new Error('Say something to the assistant first')

  for (let step = 0; step < MAX_MODEL_STEPS; step += 1) {
    const content = await callModel([...transcript])
    const turn: GeminiContent = { role: 'model', parts: content.parts?.length ? content.parts : [{ text: '' }] }
    transcript.push(turn)

    const calls = functionCalls(turn)
    if (calls.length === 0) {
      return { transcript, reply: replyText(turn), pendingAction: null, toolEvents: events }
    }

    const write = calls.find((call) => isWriteTool(call.name))
    if (write) {
      return {
        transcript,
        reply: replyText(turn),
        pendingAction: await toPending(write, callTool),
        toolEvents: events,
      }
    }

    const responses: GeminiPart[] = []
    for (const call of calls) responses.push(await runCall(call, callTool, events))
    transcript.push({ role: 'user', parts: responses })
  }

  return {
    transcript,
    reply: 'I stopped before finishing that. Try asking again, a bit more specifically.',
    pendingAction: null,
    toolEvents: events,
  }
}
