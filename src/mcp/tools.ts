import type { Db } from '../lib/contacts.ts'
import { createContact, findContacts, getContact, updateContact } from '../lib/contacts.ts'
import { createInteraction, listInteractions } from '../lib/interactions.ts'
import { listOverdueContacts } from '../lib/overdue.ts'
import type { ContactUpdate } from '../types/database.ts'
import { todayInTimeZone } from '../utils/dates.ts'

export const MCP_TOOL_NAMES = [
  'find_contacts',
  'get_contact',
  'create_contact',
  'update_contact',
  'log_interaction',
  'get_overdue_contacts',
] as const

export type McpToolName = (typeof MCP_TOOL_NAMES)[number]

type ToolResult = { text: string; isError: boolean }

function ok(value: unknown): ToolResult {
  return { text: JSON.stringify(value, null, 2), isError: false }
}

function fail(message: string): ToolResult {
  return { text: message, isError: true }
}

const FAILED_ACTION: Record<string, string> = {
  create_contact: 'Could not create that person',
  update_contact: 'Could not update that person',
  log_interaction: 'Could not log that conversation',
}

function failedAction(tool: string) {
  return FAILED_ACTION[tool] ?? 'Could not load that'
}

type ErrorLike = { message?: string; code?: unknown; details?: unknown; hint?: unknown; name?: string; stack?: string }

/** Postgres / PostgREST / auth errors carry a code; our own validation errors are plain Errors. */
function isBackendError(error: ErrorLike) {
  return typeof error.code === 'string' || error.details != null || error.hint != null
}

type Ctx = { tool: string; userId: string }

/** Validation messages are safe to show. Backend details are logged, never returned. */
function failWith(ctx: Ctx, error: ErrorLike | null | undefined, fallback?: string): ToolResult {
  if (!error) return fail(fallback ?? failedAction(ctx.tool))
  if (!isBackendError(error)) return fail(error.message || failedAction(ctx.tool))
  console.error(
    JSON.stringify({
      event: 'mcp_tool_failed',
      tool: ctx.tool,
      userId: ctx.userId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    }),
  )
  if (error.code === 'PGRST116') return fail('No contact with that id')
  return fail(`${failedAction(ctx.tool)}. Check the fields and try again.`)
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

function asRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

export function mcpToolDefinitions() {
  return [
    {
      name: 'find_contacts',
      description: "Search this user's people by name, email, or how they know them.",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional. Empty returns every active person.' },
        },
        additionalProperties: false,
      },
    },
    {
      name: 'get_contact',
      description: 'Full profile for one person. Set include_interactions to include conversation history.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          include_interactions: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    {
      name: 'create_contact',
      description: 'Add a person. Same fields as the app: name is required, cadence defaults to monthly (30 days).',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship_type: { type: 'string' },
          cadence_days: { type: 'integer' },
          birthday: { type: 'string', description: 'YYYY-MM-DD' },
          notes: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    {
      name: 'update_contact',
      description: 'Change fields on a person the user already has. Does not delete anyone.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          relationship_type: { type: 'string' },
          cadence_days: { type: 'integer' },
          birthday: { type: 'string' },
          notes: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          archived: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    {
      name: 'log_interaction',
      description: 'Log a conversation. Omit the date to use today in the user timezone. This clears overdue the same way as reaching out in the app.',
      inputSchema: {
        type: 'object',
        properties: {
          contact_id: { type: 'string' },
          occurred_on: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
          note: { type: 'string' },
        },
        required: ['contact_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_overdue_contacts',
      description: 'People the user is late to talk to, including anyone with no conversations yet.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
  ]
}

function contactFields(args: Record<string, unknown>) {
  const fields: ContactUpdate = {}
  if ('name' in args) fields.name = asString(args.name)
  if ('relationship_type' in args) fields.relationship_type = asString(args.relationship_type) ?? null
  if ('cadence_days' in args) fields.cadence_days = asNumber(args.cadence_days)
  if ('birthday' in args) fields.birthday = asString(args.birthday) ?? null
  if ('notes' in args) fields.notes = asString(args.notes) ?? null
  if ('phone' in args) fields.phone = asString(args.phone) ?? null
  if ('email' in args) fields.email = asString(args.email) ?? null
  if ('archived' in args) fields.archived = asBoolean(args.archived)
  return fields
}

export async function callMcpTool(db: Db, userId: string, name: string, rawArgs: unknown): Promise<ToolResult> {
  try {
    return await runTool(db, { tool: name, userId }, asRecord(rawArgs))
  } catch (thrown) {
    const error = (thrown instanceof Error ? thrown : new Error(String(thrown))) as ErrorLike
    console.error(
      JSON.stringify({
        event: 'mcp_tool_threw',
        tool: name,
        userId,
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      }),
    )
    return fail(`${failedAction(name)}. Try again shortly.`)
  }
}

async function runTool(db: Db, ctx: Ctx, args: Record<string, unknown>): Promise<ToolResult> {
  const { tool: name, userId } = ctx

  if (name === 'find_contacts') {
    const result = await findContacts(asString(args.query) ?? '', db)
    if (result.error) return failWith(ctx, result.error)
    return ok(result.data)
  }

  if (name === 'get_contact') {
    const id = asString(args.id)?.trim()
    if (!id) return fail('id is required')
    const contact = await getContact(id, db)
    if (contact.error) return failWith(ctx, contact.error)
    if (!contact.data) return fail('No contact with that id')
    if (args.include_interactions === true) {
      const history = await listInteractions(id, db)
      if (history.error) return failWith(ctx, history.error)
      return ok({ contact: contact.data, interactions: history.data })
    }
    return ok({ contact: contact.data })
  }

  if (name === 'create_contact') {
    const nameValue = asString(args.name)
    if (nameValue == null) return fail('Name is required')
    if ('cadence_days' in args && asNumber(args.cadence_days) == null) {
      return fail('cadence_days must be a whole number of days greater than 0')
    }
    const birthday = asString(args.birthday)?.trim()
    if (birthday && !isIsoDate(birthday)) return fail('birthday must be a real date as YYYY-MM-DD')
    const result = await createContact(
      {
        name: nameValue,
        relationship_type: asString(args.relationship_type),
        cadence_days: asNumber(args.cadence_days),
        birthday: asString(args.birthday),
        notes: asString(args.notes),
        phone: asString(args.phone),
        email: asString(args.email),
      },
      db,
      userId,
    )
    if (result.error || !result.data) return failWith(ctx, result.error)
    return ok(result.data)
  }

  if (name === 'update_contact') {
    const id = asString(args.id)?.trim()
    if (!id) return fail('id is required')
    if ('cadence_days' in args && asNumber(args.cadence_days) == null) {
      return fail('cadence_days must be a whole number of days greater than 0')
    }
    const birthday = asString(args.birthday)?.trim()
    if (birthday && !isIsoDate(birthday)) return fail('birthday must be a real date as YYYY-MM-DD')
    const fields = contactFields(args)
    if (Object.keys(fields).length === 0) return fail('Say which fields to change')
    const result = await updateContact(id, fields, db)
    if (result.error || !result.data) return failWith(ctx, result.error)
    return ok(result.data)
  }

  if (name === 'log_interaction') {
    const contactId = asString(args.contact_id)?.trim()
    if (!contactId) return fail('contact_id is required')
    const profile = await db.from('users').select('timezone').eq('id', userId).maybeSingle()
    if (profile.error) return failWith(ctx, profile.error)
    const occurredOn = asString(args.occurred_on)?.trim() || todayInTimeZone(profile.data?.timezone || 'UTC')
    const result = await createInteraction(
      { contact_id: contactId, occurred_on: occurredOn, note: asString(args.note) },
      db,
    )
    if (result.error || !result.data) return failWith(ctx, result.error)
    return ok(result.data)
  }

  if (name === 'get_overdue_contacts') {
    const result = await listOverdueContacts(db)
    if (result.error) return failWith(ctx, result.error)
    return ok(result.data)
  }

  return fail('Unknown tool')
}
