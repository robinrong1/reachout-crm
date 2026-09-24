import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../lib/contacts'
import type { Database } from '../types/database'
import { addDays, todayInTimeZone } from '../utils/dates'
import { callMcpTool } from './tools'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const CONTACT_ID = '00000000-0000-4000-8000-0000000000c1'
const TIME_ZONE = 'America/Toronto'

type Request = { method: string; table: string; url: string; body: Record<string, unknown> | undefined }
type Route = (request: Request) => Response | undefined

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function pgError(code: string, message: string, status = 400) {
  return json({ code, message, details: null, hint: null }, status)
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    user_id: USER_ID,
    name: 'Marcus Delgado',
    relationship_type: null,
    cadence_days: 30,
    birthday: null,
    notes: null,
    phone: null,
    email: null,
    archived: false,
    source: 'manual',
    nudge: null,
    snoozed_until: null,
    created_at: '2026-09-23T00:00:00Z',
    ...overrides,
  }
}

/** Defaults: the user is in Toronto, they have no other people, and inserts echo back. */
const defaults: Route = ({ method, table, body }) => {
  if (method === 'GET' && table === 'users') return json([{ timezone: TIME_ZONE }])
  if (method === 'GET' && table === 'contacts') return json([])
  if (method === 'POST') return json({ id: 'new-id', archived: false, source: 'manual', ...body }, 201)
  return undefined
}

/** Built the same way as supabase/functions/mcp: an accessToken client, whose `.auth` throws on access. */
function mcpDb(route: Route = () => undefined) {
  const calls: Request[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const request: Request = {
      method: init?.method ?? 'GET',
      table: new URL(url).pathname.split('/').pop() ?? '',
      url,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(request)
    const response = route(request) ?? defaults(request)
    if (!response) throw new Error(`Unexpected ${request.method} ${url}`)
    return response
  }
  const db = createClient<Database>('https://example.supabase.co', 'anon-key', {
    accessToken: async () => 'jwt',
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
  return { db, calls, writes: () => calls.filter((call) => call.method !== 'GET') }
}

function loggedEvent(log: { mock: { calls: unknown[][] } }) {
  return JSON.parse(String(log.mock.calls[0][0]))
}

const FULL = {
  name: 'Marcus Delgado',
  relationship_type: 'Friend',
  birthday: '1991-07-14',
  email: 'marcus.delgado@example.com',
  phone: '5550142387',
  cadence_days: 14,
  notes: 'Met at a climbing gym. Into bouldering and specialty coffee.',
}

afterEach(() => vi.restoreAllMocks())

describe('create_contact over MCP', () => {
  it('creates a person from a name-only payload with app defaults', async () => {
    const { db, writes } = mcpDb()
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result.isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(writes()[0].table).toBe('contacts')
    expect(writes()[0].body).toEqual({
      user_id: USER_ID,
      name: 'Test',
      relationship_type: null,
      cadence_days: 30,
      birthday: null,
      notes: null,
      phone: null,
      email: null,
    })
    expect(JSON.parse(result.text)).not.toHaveProperty('possible_duplicates')
  })

  it('creates a person from the full payload', async () => {
    const { db, writes } = mcpDb()
    const result = await callMcpTool(db, USER_ID, 'create_contact', FULL)

    expect(result.isError).toBe(false)
    expect(writes()[0].body).toEqual({ user_id: USER_ID, ...FULL })
    expect(JSON.parse(result.text)).toMatchObject({ user_id: USER_ID, name: 'Marcus Delgado', source: 'manual' })
  })

  it('succeeds as each field is added one at a time', async () => {
    const steps = [
      { name: 'Test' },
      { relationship_type: 'Friend' },
      { cadence_days: 14 },
      { birthday: '1991-07-14' },
      { email: 'marcus.delgado@example.com', phone: '+1 (555) 014-2387' },
      { notes: 'Met at a climbing gym.' },
    ]
    let args: Record<string, unknown> = {}
    for (const step of steps) {
      args = { ...args, ...step }
      const { db } = mcpDb()
      const result = await callMcpTool(db, USER_ID, 'create_contact', args)
      expect(result, JSON.stringify(Object.keys(args))).toMatchObject({ isError: false })
    }
  })

  it('reports every invalid field at once, without writing', async () => {
    const { db, writes } = mcpDb()
    const result = await callMcpTool(db, USER_ID, 'create_contact', {
      name: 'A',
      phone: 'abc',
      birthday: '2999-01-01',
      cadence_days: 100000,
      email: 'nope',
    })

    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/Cadence can be at most 3650 days/)
    expect(result.text).toMatch(/Birthday cannot be in the future/)
    expect(result.text).toMatch(/Email should look like/)
    expect(result.text).toMatch(/Phone should be 7 to 15 digits/)
    expect(writes()).toHaveLength(0)
  })

  it('rejects impossible dates and blank names with clear messages', async () => {
    const { db, writes } = mcpDb()
    expect((await callMcpTool(db, USER_ID, 'create_contact', { name: 'A', birthday: '1991-02-30' })).text).toBe(
      'Birthday must be a real date as YYYY-MM-DD',
    )
    expect((await callMcpTool(db, USER_ID, 'create_contact', { name: '  ' })).text).toBe('Name is required')
    expect((await callMcpTool(db, USER_ID, 'create_contact', { name: 'A', cadence_days: 1.5 })).text).toMatch(/whole number/)
    expect(writes()).toHaveLength(0)
  })

  it('warns about an active person with the same name or email, but still creates', async () => {
    const { db, writes } = mcpDb(({ method, table }) =>
      method === 'GET' && table === 'contacts'
        ? json([
            contactRow({ id: 'dup-name', name: 'robin  rong' }),
            contactRow({ id: 'dup-email', name: 'R. Rong', email: 'Robin@Example.com' }),
            contactRow({ id: 'other', name: 'Someone Else' }),
          ])
        : undefined,
    )
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Robin Rong', email: 'robin@example.com' })

    expect(result.isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(JSON.parse(result.text).possible_duplicates.map((row: { id: string }) => row.id)).toEqual(['dup-name', 'dup-email'])
  })

  it('fails cleanly with no user context, without touching db.auth or the database', async () => {
    const { db, calls } = mcpDb()
    const result = await callMcpTool(db, '', 'create_contact', { name: 'Test' })

    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/Reconnect/) })
    expect(calls).toHaveLength(0)
  })

  it('asks to reconnect when RLS rejects a mismatched user on create', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, writes } = mcpDb(({ method }) =>
      method === 'POST' ? pgError('42501', 'new row violates row-level security policy for table "contacts"', 403) : undefined,
    )
    const result = await callMcpTool(db, 'someone-else', 'create_contact', { name: 'Test' })

    expect(writes()[0].body?.user_id).toBe('someone-else')
    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/Reconnect/) })
    expect(result.text).not.toMatch(/row-level/)
    expect(loggedEvent(log)).toMatchObject({ code: '42501', userId: 'someone-else' })
  })

  it('hides database internals from the client but logs them server-side', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = mcpDb(({ method }) =>
      method === 'POST'
        ? pgError('23514', 'new row for relation "contacts" violates check constraint "contacts_cadence_days_positive"')
        : undefined,
    )
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result).toEqual({ isError: true, text: 'Could not create that person. Check the fields and try again.' })
    expect(loggedEvent(log)).toMatchObject({
      event: 'mcp_tool_failed',
      tool: 'create_contact',
      userId: USER_ID,
      code: '23514',
      constraint: 'contacts_cadence_days_positive',
    })
  })

  it('treats a network failure as a backend error: logged, not shown', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = mcpDb(({ method }) => {
      if (method === 'POST') throw new Error('socket hang up')
      return undefined
    })
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result).toEqual({ isError: true, text: 'Could not create that person. Try again shortly.' })
    expect(String(log.mock.calls[0][0])).toMatch(/socket hang up/)
  })

  it('logs the stack when something throws, and returns a safe message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = {
      from() {
        throw new Error('boom')
      },
    } as unknown as Db
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result).toMatchObject({ isError: true, text: 'Could not create that person. Try again shortly.' })
    expect(loggedEvent(log)).toMatchObject({ event: 'mcp_tool_threw', stack: expect.any(String) })
  })
})

describe('update_contact over MCP', () => {
  it('reports every invalid field at once, without writing', async () => {
    const { db, writes } = mcpDb()
    const result = await callMcpTool(db, USER_ID, 'update_contact', {
      id: CONTACT_ID,
      birthday: '2999-01-01',
      phone: 'abc',
      cadence_days: 0,
    })

    expect(result.text.split('; ')).toEqual([
      'Cadence must be a whole number of days greater than 0',
      'Birthday cannot be in the future',
      'Phone should be 7 to 15 digits, like 5550142387 or +1 555 014 2387',
    ])
    expect(writes()).toHaveLength(0)
  })

  it('still lets empty strings clear phone and birthday', async () => {
    const { db, writes } = mcpDb(({ method }) => (method === 'PATCH' ? json(contactRow()) : undefined))
    const result = await callMcpTool(db, USER_ID, 'update_contact', { id: CONTACT_ID, phone: '', birthday: '' })

    expect(result.isError).toBe(false)
    expect(writes()[0].body).toEqual({ phone: null, birthday: null })
  })
})

describe('log_interaction over MCP', () => {
  const today = todayInTimeZone(TIME_ZONE)

  function withContact(overrides: Record<string, unknown> = {}): Route {
    return ({ method, table }) => (method === 'GET' && table === 'contacts' ? json([contactRow(overrides)]) : undefined)
  }

  it("defaults to today in the user's timezone", async () => {
    const { db, writes } = mcpDb(withContact())
    const result = await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID })

    expect(result.isError).toBe(false)
    expect(writes()).toHaveLength(1)
    expect(writes()[0]).toMatchObject({ table: 'interactions', body: { contact_id: CONTACT_ID, occurred_on: today } })
  })

  it('says "No contact with that id" for an unknown id, without inserting', async () => {
    const { db, writes } = mcpDb()
    const result = await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID })

    expect(result).toEqual({ isError: true, text: 'No contact with that id' })
    expect(writes()).toHaveLength(0)
  })

  it('says "No contact with that id" for a malformed id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = mcpDb(({ table }) =>
      table === 'contacts' ? pgError('22P02', 'invalid input syntax for type uuid: "nope"') : undefined,
    )
    expect((await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: 'nope' })).text).toBe('No contact with that id')
  })

  it('treats an RLS rejection on insert as an unknown contact, not a permissions problem', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = mcpDb(({ method, table }) => {
      if (method === 'GET' && table === 'contacts') return json([contactRow()])
      if (method === 'POST') return pgError('42501', 'new row violates row-level security policy for table "interactions"', 403)
      return undefined
    })
    const result = await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID })

    expect(result.text).toBe('No contact with that id')
    expect(result.text).not.toMatch(/Reconnect/)
  })

  it('refuses archived people', async () => {
    const { db, writes } = mcpDb(withContact({ archived: true, name: 'Priya Nair' }))
    const result = await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID })

    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/^Priya Nair is archived/) })
    expect(writes()).toHaveLength(0)
  })

  it('rejects future dates in the user timezone', async () => {
    const { db, writes } = mcpDb(withContact())
    const tomorrow = addDays(today, 1)

    expect((await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID, occurred_on: tomorrow })).text).toBe(
      'Date cannot be in the future',
    )
    expect((await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID, occurred_on: today })).isError).toBe(false)
    expect(writes()).toHaveLength(1)
  })

  it('uses the same real-date wording as birthdays, and reports every problem at once', async () => {
    const { db, calls } = mcpDb(withContact())
    expect((await callMcpTool(db, USER_ID, 'log_interaction', { contact_id: CONTACT_ID, occurred_on: '2026-02-30' })).text).toBe(
      'Date must be a real date as YYYY-MM-DD',
    )
    expect((await callMcpTool(db, USER_ID, 'log_interaction', { occurred_on: '2026-02-30', note: 5 })).text).toBe(
      'contact_id is required; note must be text; Date must be a real date as YYYY-MM-DD',
    )
    expect(calls).toHaveLength(0)
  })
})
