import { describe, expect, it } from 'vitest'
import {
  isDigestDue,
  reminderWasSentOnLocalDate,
} from '../../supabase/functions/_shared/dates.ts'
import { formatDigestEmail, sortDigestContacts } from '../../supabase/functions/_shared/digest.ts'
import { signReachOutToken, verifyReachOutToken } from '../../supabase/functions/_shared/token.ts'

describe('digest selection', () => {
  it('is due when local weekday matches digest_day_of_week', () => {
    const mondayUtc = new Date('2026-09-21T12:00:00.000Z')
    expect(isDigestDue(1, 'UTC', mondayUtc)).toBe(true)
    expect(isDigestDue(0, 'UTC', mondayUtc)).toBe(false)
  })

  it('uses the user timezone for weekday (Sunday in Toronto, Monday in UTC)', () => {
    const sundayEveningToronto = new Date('2026-09-21T03:00:00.000Z')
    expect(isDigestDue(1, 'UTC', sundayEveningToronto)).toBe(true)
    expect(isDigestDue(0, 'America/Toronto', sundayEveningToronto)).toBe(true)
    expect(isDigestDue(1, 'America/Toronto', sundayEveningToronto)).toBe(false)
  })

  it('treats a reminder as already sent on the matching local date', () => {
    const sentAt = '2026-09-21T03:00:00.000Z'
    expect(reminderWasSentOnLocalDate(sentAt, 'UTC', '2026-09-21')).toBe(true)
    expect(reminderWasSentOnLocalDate(sentAt, 'America/Toronto', '2026-09-20')).toBe(true)
    expect(reminderWasSentOnLocalDate(sentAt, 'UTC', '2026-09-20')).toBe(false)
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

  it('adds a nudge line when one was written, and skips a blank nudge', () => {
    const withNudge = formatDigestEmail(
      [{ id: '1', name: 'Sarah', days_overdue: 3, nudge: 'Ask about the new job' }],
      { '1': 'https://example.com/a' },
      { '1': 'https://example.com/later' },
    )
    expect(withNudge.text).toContain('Sarah — 3 days overdue\nAsk about the new job')
    expect(withNudge.text).toContain('Not this week: https://example.com/later')
    expect(withNudge.html).toContain('Not this week')
    expect(withNudge.html).toContain('Ask about the new job')
    expect(withNudge.text).not.toContain('general notes')

    const blank = formatDigestEmail([{ id: '1', name: 'Sarah', days_overdue: 3, nudge: '   ' }], {
      '1': 'https://example.com/a',
    })
    expect(blank.text).not.toContain('Ask about the new job')
    expect(blank.text).toContain('Sarah — 3 days overdue')
  })

  it('puts a group member under that heading once', () => {
    const { text, html } = formatDigestEmail(
      [
        { id: '1', name: 'Mom', days_overdue: 4, group_name: 'Family' },
        { id: '2', name: 'Sam', days_overdue: 9 },
        { id: '3', name: 'Ada', days_overdue: 2, group_name: 'College' },
      ],
      {
        '1': 'https://example.com/a',
        '2': 'https://example.com/b',
        '3': 'https://example.com/c',
      },
    )
    const samAt = text.indexOf('Sam —')
    const familyAt = text.indexOf('\nFamily\n')
    const momAt = text.indexOf('Mom —')
    const collegeAt = text.indexOf('\nCollege\n')
    expect(samAt).toBeGreaterThan(-1)
    expect(collegeAt).toBeGreaterThan(samAt)
    expect(familyAt).toBeGreaterThan(collegeAt)
    expect(momAt).toBeGreaterThan(familyAt)
    expect(text.match(/Mom —/g)).toHaveLength(1)
    expect(html).toContain('<p>Family</p>')
    expect(html.match(/Mom —/g)).toHaveLength(1)
  })

  it('lists a never-contacted person as due today', () => {
    const { text } = formatDigestEmail([{ id: '1', name: 'Jamie', days_overdue: 0 }], {
      '1': 'https://example.com/a',
    })
    expect(text).toContain('Jamie — due today')
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
