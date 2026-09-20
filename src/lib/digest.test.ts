import { describe, expect, it } from 'vitest'
import { isDigestDue } from '../../supabase/functions/_shared/dates.ts'
import { formatDigestEmail, sortDigestContacts } from '../../supabase/functions/_shared/digest.ts'
import { signReachOutToken, verifyReachOutToken } from '../../supabase/functions/_shared/token.ts'

describe('digest selection', () => {
  it('is due when local weekday matches digest_day_of_week', () => {
    const mondayUtc = new Date('2026-09-21T12:00:00.000Z')
    expect(isDigestDue(1, 'UTC', mondayUtc)).toBe(true)
    expect(isDigestDue(0, 'UTC', mondayUtc)).toBe(false)
  })

  it('sorts most overdue first', () => {
    const sorted = sortDigestContacts([
      { id: 'a', name: 'Jamie', days_overdue: 4 },
      { id: 'b', name: 'Sarah', days_overdue: 24 },
      { id: 'c', name: 'Marcus', days_overdue: 11 },
    ])
    expect(sorted.map((contact) => contact.name)).toEqual(['Sarah', 'Marcus', 'Jamie'])
  })
})

describe('digest copy', () => {
  it('includes names and days overdue, not notes', () => {
    const { text, html, subject } = formatDigestEmail(
      [
        { id: '1', name: 'Sarah', days_overdue: 24 },
        { id: '2', name: 'Marcus', days_overdue: 11 },
      ],
      {
        '1': 'https://example.com/a',
        '2': 'https://example.com/b',
      },
    )

    expect(subject).toBe('Your weekly relationship check-in')
    expect(text).toContain('2 people are overdue')
    expect(text).toContain('Sarah — 24 days overdue')
    expect(text).toContain('Marcus — 11 days overdue')
    expect(text).toContain('Mark Sarah as reached out: https://example.com/a')
    expect(text).not.toContain('note')
    expect(html).toContain('href="https://example.com/a"')
  })
})

describe('reach-out token', () => {
  it('round-trips a valid token and rejects a tampered one', async () => {
    const secret = 'test-secret'
    const token = await signReachOutToken(secret, {
      userId: 'user-1',
      contactId: 'contact-1',
      exp: Date.now() + 60_000,
    })

    await expect(verifyReachOutToken(secret, token)).resolves.toMatchObject({
      userId: 'user-1',
      contactId: 'contact-1',
    })
    await expect(verifyReachOutToken(secret, `${token}x`)).resolves.toBeNull()
    await expect(verifyReachOutToken('other-secret', token)).resolves.toBeNull()
  })

  it('rejects an expired token', async () => {
    const token = await signReachOutToken('test-secret', {
      userId: 'user-1',
      contactId: 'contact-1',
      exp: Date.now() - 1,
    })
    await expect(verifyReachOutToken('test-secret', token)).resolves.toBeNull()
  })
})
