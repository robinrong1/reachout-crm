import { describe, expect, it } from 'vitest'
import { contactMatchesQuery } from './contacts'
import { consumeMcpRate } from './mcpRate'
import { generateMcpToken, hashMcpToken, isMcpToken, validateMcpLabel } from './mcpToken'
import { readJwtPayload, signUserJwt } from './userJwt'

describe('mcp tokens', () => {
  it('hashes a token stably and only accepts the reach_ prefix', async () => {
    const token = generateMcpToken()
    expect(isMcpToken(token)).toBe(true)
    expect(await hashMcpToken(token)).toBe(await hashMcpToken(token))
    expect(await hashMcpToken(token)).not.toBe(await hashMcpToken(`${token}x`))
    expect(isMcpToken('supabase-jwt')).toBe(false)
    expect(validateMcpLabel('  ')).toBeInstanceOf(Error)
    expect(validateMcpLabel('Claude')).toBeNull()
  })
})

describe('mcp rate limit', () => {
  it('allows a window, then blocks, then resets', () => {
    const first = consumeMcpRate({ now: 0, windowStartedAt: null, windowCount: 0, limit: 2, windowMs: 1000 })
    expect(first.allowed).toBe(true)
    if (!first.allowed) return

    const second = consumeMcpRate({
      now: 10,
      windowStartedAt: first.windowStartedAt,
      windowCount: first.windowCount,
      limit: 2,
      windowMs: 1000,
    })
    expect(second.allowed && second.windowCount).toBe(2)

    const blocked = consumeMcpRate({
      now: 20,
      windowStartedAt: first.windowStartedAt,
      windowCount: 2,
      limit: 2,
      windowMs: 1000,
    })
    expect(blocked.allowed).toBe(false)

    const reset = consumeMcpRate({
      now: 2000,
      windowStartedAt: first.windowStartedAt,
      windowCount: 2,
      limit: 2,
      windowMs: 1000,
    })
    expect(reset.allowed && reset.windowCount).toBe(1)
  })
})

describe('user jwt', () => {
  it('puts the user id in a short-lived authenticated token', async () => {
    const token = await signUserJwt('jwt-secret', {
      userId: 'user-1',
      issuer: 'https://example.supabase.co/auth/v1',
      now: 1_700_000_000_000,
    })
    expect(readJwtPayload(token)).toMatchObject({ sub: 'user-1', role: 'authenticated' })
  })
})

describe('contact search', () => {
  it('matches name, email, or how you know them', () => {
    const person = { name: 'Ada Lovelace', email: 'ada@example.com', relationship_type: 'mentor' }
    expect(contactMatchesQuery(person, 'love')).toBe(true)
    expect(contactMatchesQuery(person, 'ADA@')).toBe(true)
    expect(contactMatchesQuery(person, 'mentor')).toBe(true)
    expect(contactMatchesQuery(person, 'jamie')).toBe(false)
  })
})
