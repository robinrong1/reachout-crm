import type { Db } from '../lib/contacts.ts'
import { createContact, findContacts, getContact, updateContact } from '../lib/contacts.ts'
import { createInteraction, listInteractions, validateOccurredOn } from '../lib/interactions.ts'
import { listOverdueContacts } from '../lib/overdue.ts'
import { contactInputErrors } from '../lib/contactFields.ts'
import { MAX_CADENCE_DAYS } from '../lib/cadence.ts'
import type { Contact, ContactUpdate } from '../types/database.ts'
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

const RECONNECT = 'The assistant is not allowed to do that for this account. Reconnect it in Settings and try again.'

/** The JWT was missing, invalid, or expired. */
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303'])

/**
 * 42501 is an RLS WITH CHECK rejection. On create that means the token's user does not
 * match; everywhere else it means the contact id is not one of this user's people.
 * 22P02 is a malformed uuid.
 */
function isUnknownContact(ctx: Ctx, code: unknown) {
  if (code === 'PGRST116' || code === '22P02') return true
  return code === '42501' && ctx.tool !== 'create_contact'
}

/** PostgREST has no constraint field; Postgres puts the name in the message. */
function constraintName(message: string | undefined) {
  return message ? /constraint "([^"]+)"/.exec(message)?.[1] : undefined
}

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
      constraint: constraintName(error.message),
    }),
  )
  if (isUnknownContact(ctx, error.code)) return fail(NO_CONTACT)
  if (error.code === '42501' || (typeof error.code === 'string' && AUTH_CODES.has(error.code))) return fail(RECONNECT)
  const badData = typeof error.code === 'string' && /^2[23]/.test(error.code)
  return fail(`${failedAction(ctx.tool)}. ${badData ? 'Check the fields and try again.' : 'Try again shortly.'}`)
}

const NO_CONTACT = 'No contact with that id'

function failValidation(messages: string[]) {
  return fail(messages.join('; '))
}

const STRING_FIELDS = ['name', 'relationship_type', 'birthday', 'notes', 'phone', 'email'] as const

/** Wrong JSON types, reported per field alongside the value checks. */
function contactTypeErrors(args: Record<string, unknown>) {
  const errors: string[] = []
  for (const field of STRING_FIELDS) {
    if (field in args && args[field] != null && typeof args[field] !== 'string') errors.push(`${field} must be text`)
  }
  if ('cadence_days' in args && asNumber(args.cadence_days) == null) {
    errors.push('Cadence must be a whole number of days greater than 0')
  }
  if ('archived' in args && asBoolean(args.archived) == null) errors.push('archived must be true or false')
  return errors
}

async function userToday(db: Db, userId: string) {
  const profile = await db.from('users').select('timezone').eq('id', userId).maybeSingle()
  return { today: todayInTimeZone(profile.data?.timezone || 'UTC'), error: profile.error }
}

/** Contact fields only need "today" to reject a future birthday; skip the lookup otherwise. */
async function todayForBirthday(db: Db, userId: string, args: Record<string, unknown>) {
  const birthday = asString(args.birthday)?.trim()
  if (!birthday) return { today: todayInTimeZone('UTC'), error: null }
  return userToday(db, userId)
}

function normalizedName(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Same name or email as another active person. A warning, not a block: two people can share a name. */
async function possibleDuplicates(db: Db, created: Contact) {
  const active = await findContacts('', db)
  if (active.error || !active.data) return []
  const name = normalizedName(created.name)
  const email = created.email?.trim().toLowerCase()
  return active.data
    .filter((other) => other.id !== created.id)
    .filter((other) => normalizedName(other.name) === name || (email && other.email?.trim().toLowerCase() === email))
    .map((other) => ({ id: other.id, name: other.name, email: other.email }))
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
      description:
        'Add a person. Same fields as the app: name is required, cadence defaults to monthly (30 days). ' +
        'The result includes possible_duplicates when someone active already has the same name or email.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship_type: { type: 'string' },
          cadence_days: { type: 'integer', minimum: 1, maximum: MAX_CADENCE_DAYS },
          birthday: { type: 'string', description: 'YYYY-MM-DD, not in the future' },
          notes: { type: 'string' },
          phone: { type: 'string', description: '7 to 15 digits; +, spaces, dashes, and parentheses allowed' },
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
          cadence_days: { type: 'integer', minimum: 1, maximum: MAX_CADENCE_DAYS },
          birthday: { type: 'string', description: 'YYYY-MM-DD, not in the future. Empty string clears it.' },
          notes: { type: 'string' },
          phone: { type: 'string', description: '7 to 15 digits. Empty string clears it.' },
          email: { type: 'string' },
          archived: { type: 'boolean' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
    {
      name: 'log_interaction',
      description:
        'Log a conversation with an active (not archived) person. Omit the date to use today in the user timezone. ' +
        'This clears overdue the same way as reaching out in the app.',
      inputSchema: {
        type: 'object',
        properties: {
          contact_id: { type: 'string' },
          occurred_on: { type: 'string', description: 'YYYY-MM-DD, not in the future. Defaults to today.' },
          note: { type: 'string' },
        },
        required: ['contact_id'],
        additionalProperties: false,
      },
    },
    {
      name: 'get_overdue_contacts',
      description:
        'People the user is late to talk to, most overdue first, including anyone with no conversations yet (days_overdue 0).',
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
    if (!contact.data) return fail(NO_CONTACT)
    if (args.include_interactions === true) {
      const history = await listInteractions(id, db)
      if (history.error) return failWith(ctx, history.error)
      return ok({ contact: contact.data, interactions: history.data })
    }
    return ok({ contact: contact.data })
  }

  if (name === 'create_contact') {
    if (!userId.trim()) return fail(RECONNECT)
    const input = {
      name: asString(args.name) ?? '',
      relationship_type: asString(args.relationship_type),
      cadence_days: asNumber(args.cadence_days),
      birthday: asString(args.birthday),
      notes: asString(args.notes),
      phone: asString(args.phone),
      email: asString(args.email),
    }
    const { today, error: todayError } = await todayForBirthday(db, userId, args)
    if (todayError) return failWith(ctx, todayError)
    const invalid = [...contactTypeErrors(args), ...contactInputErrors(input, { requireName: true, today })]
    if (invalid.length > 0) return failValidation(invalid)
    const result = await createContact(input, db, { userId, today })
    if (result.error || !result.data) return failWith(ctx, result.error)
    const duplicates = await possibleDuplicates(db, result.data)
    return ok(duplicates.length > 0 ? { ...result.data, possible_duplicates: duplicates } : result.data)
  }

  if (name === 'update_contact') {
    const id = asString(args.id)?.trim()
    if (!id) return fail('id is required')
    const fields = contactFields(args)
    const { today, error: todayError } = await todayForBirthday(db, userId, args)
    if (todayError) return failWith(ctx, todayError)
    const invalid = [...contactTypeErrors(args), ...contactInputErrors(fields, { requireName: false, today })]
    if (invalid.length > 0) return failValidation(invalid)
    if (Object.keys(fields).length === 0) return fail('Say which fields to change')
    const result = await updateContact(id, fields, db, today)
    if (result.error || !result.data) return failWith(ctx, result.error)
    return ok(result.data)
  }

  if (name === 'log_interaction') {
    const contactId = asString(args.contact_id)?.trim()
    const invalid: string[] = []
    if (!contactId) invalid.push('contact_id is required')
    if ('occurred_on' in args && args.occurred_on != null && typeof args.occurred_on !== 'string') {
      invalid.push('occurred_on must be text')
    }
    if ('note' in args && args.note != null && typeof args.note !== 'string') invalid.push('note must be text')
    const requested = asString(args.occurred_on)?.trim()
    if (requested) {
      const formatError = validateOccurredOn(requested, '9999-12-31')
      if (formatError) invalid.push(formatError.message)
    }
    if (invalid.length > 0 || !contactId) return failValidation(invalid)
    const { today, error: todayError } = await userToday(db, userId)
    if (todayError) return failWith(ctx, todayError)
    const occurredOn = requested || today
    const dateError = validateOccurredOn(occurredOn, today)
    if (dateError) return fail(dateError.message)

    const contact = await getContact(contactId, db)
    if (contact.error) return failWith(ctx, contact.error)
    if (!contact.data) return fail(NO_CONTACT)
    if (contact.data.archived) {
      return fail(`${contact.data.name} is archived. Unarchive them first with update_contact (archived: false).`)
    }
    const result = await createInteraction(
      { contact_id: contactId, occurred_on: occurredOn, note: asString(args.note) },
      db,
      today,
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
