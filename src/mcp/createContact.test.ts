import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../lib/contacts'
import type { Database } from '../types/database'
import { callMcpTool } from './tools'

const USER_ID = '00000000-0000-4000-8000-000000000001'

type Captured = { url: string; method: string; body: unknown }

/** Built the same way as supabase/functions/mcp: an accessToken client, whose `.auth` throws on access. */
function mcpDb(respond: (body: Record<string, unknown>) => Response) {
  const calls: Captured[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url: String(input), method: init?.method ?? 'GET', body })
    return respond(body)
  }
  const db = createClient<Database>('https://example.supabase.co', 'anon-key', {
    accessToken: async () => 'jwt',
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
  return { db, calls }
}

function echoRow(body: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ id: 'c1', archived: false, source: 'manual', nudge: null, snoozed_until: null, ...body }),
    { status: 201, headers: { 'Content-Type': 'application/vnd.pgrst.object+json' } },
  )
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
    const { db, calls } = mcpDb(echoRow)
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result.isError).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toContain('/rest/v1/contacts')
    expect(calls[0].body).toEqual({
      user_id: USER_ID,
      name: 'Test',
      relationship_type: null,
      cadence_days: 30,
      birthday: null,
      notes: null,
      phone: null,
      email: null,
    })
  })

  it('creates a person from the full payload', async () => {
    const { db, calls } = mcpDb(echoRow)
    const result = await callMcpTool(db, USER_ID, 'create_contact', FULL)

    expect(result.isError).toBe(false)
    expect(calls[0].body).toEqual({ user_id: USER_ID, ...FULL })
    expect(JSON.parse(result.text)).toMatchObject({ id: 'c1', user_id: USER_ID, name: 'Marcus Delgado', source: 'manual' })
  })

  it('succeeds as each field is added one at a time', async () => {
    const steps = [
      { name: 'Test' },
      { relationship_type: 'Friend' },
      { cadence_days: 14 },
      { birthday: '1991-07-14' },
      { email: 'marcus.delgado@example.com', phone: '5550142387' },
      { notes: 'Met at a climbing gym.' },
    ]
    let args: Record<string, unknown> = {}
    for (const step of steps) {
      args = { ...args, ...step }
      const { db } = mcpDb(echoRow)
      const result = await callMcpTool(db, USER_ID, 'create_contact', args)
      expect(result, JSON.stringify(Object.keys(args))).toMatchObject({ isError: false })
    }
  })

  it('shows validation errors to the client without touching the database', async () => {
    const { db, calls } = mcpDb(echoRow)
    expect((await callMcpTool(db, USER_ID, 'create_contact', { name: 'A', birthday: '1991-02-30' })).text).toMatch(/YYYY-MM-DD/)
    expect((await callMcpTool(db, USER_ID, 'create_contact', { name: 'A', email: 'nope' })).text).toMatch(/Email should look like/)
    expect((await callMcpTool(db, USER_ID, 'create_contact', { name: 'A', cadence_days: 1.5 })).text).toMatch(/whole number/)
    expect(calls).toHaveLength(0)
  })

  it('hides database internals from the client but logs them server-side', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = mcpDb(
      () =>
        new Response(
          JSON.stringify({
            code: '23514',
            message: 'new row for relation "contacts" violates check constraint "contacts_cadence_days_positive"',
            details: 'Failing row contains (...)',
            hint: null,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result.isError).toBe(true)
    expect(result.text).toBe('Could not create that person. Check the fields and try again.')
    expect(result.text).not.toMatch(/contacts_cadence_days_positive/)
    const logged = JSON.parse(String(log.mock.calls[0][0]))
    expect(logged).toMatchObject({
      event: 'mcp_tool_failed',
      tool: 'create_contact',
      userId: USER_ID,
      code: '23514',
      constraint: 'contacts_cadence_days_positive',
    })
    expect(logged.message).toMatch(/contacts_cadence_days_positive/)
  })

  it('fails cleanly with no user context, without touching db.auth or the database', async () => {
    const { db, calls } = mcpDb(echoRow)
    const result = await callMcpTool(db, '', 'create_contact', { name: 'Test' })

    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/Reconnect/) })
    expect(calls).toHaveLength(0)
  })

  it('fails cleanly when RLS rejects a mismatched user', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, calls } = mcpDb(
      () =>
        new Response(
          JSON.stringify({
            code: '42501',
            message: 'new row violates row-level security policy for table "contacts"',
            details: null,
            hint: null,
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const result = await callMcpTool(db, 'someone-else', 'create_contact', { name: 'Test' })

    expect((calls[0].body as { user_id: string }).user_id).toBe('someone-else')
    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/Reconnect/) })
    expect(result.text).not.toMatch(/row-level/)
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ code: '42501', userId: 'someone-else' })
  })

  it('treats a network failure as a backend error: logged, not shown', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = mcpDb(() => {
      throw new Error('socket hang up')
    })
    const result = await callMcpTool(db, USER_ID, 'create_contact', { name: 'Test' })

    expect(result.isError).toBe(true)
    expect(result.text).not.toMatch(/socket/)
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
    const logged = JSON.parse(String(log.mock.calls[0][0]))
    expect(logged.event).toBe('mcp_tool_threw')
    expect(logged.stack).toEqual(expect.any(String))
  })
})
