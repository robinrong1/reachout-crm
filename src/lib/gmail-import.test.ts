import { describe, expect, it } from 'vitest'
import {
  GMAIL_REVIEW_CAP,
  isAutomatedAddress,
  parseMailboxes,
  suggestGmailContacts,
  type GmailHeaderMessage,
} from './gmail-import'

const owner = 'me@example.com'

function message(
  from: string,
  to: string,
  date: string,
  extras: Partial<GmailHeaderMessage> = {},
): GmailHeaderMessage {
  return { from, to, cc: '', date, listUnsubscribe: false, ...extras }
}

function exchange(person: string, date: string, extraSent = 0): GmailHeaderMessage[] {
  const messages = [message(owner, person, date), message(person, owner, date)]
  for (let index = 0; index < extraSent; index += 1) messages.push(message(owner, person, date))
  return messages
}

function suggest(messages: GmailHeaderMessage[], excludeEmails?: string[]) {
  return suggestGmailContacts(messages, { ownerEmail: owner, excludeEmails })
}

describe('parseMailboxes', () => {
  it('reads a display name, a bare address, and a quoted comma', () => {
    expect(parseMailboxes('Sam <Sam@Example.com>')).toEqual([{ name: 'Sam', email: 'sam@example.com' }])
    expect(parseMailboxes('sam@example.com')).toEqual([{ name: null, email: 'sam@example.com' }])
    expect(parseMailboxes('"Lovelace, Ada" <ada@example.com>, Bob <bob@example.com>')).toEqual([
      { name: 'Lovelace, Ada', email: 'ada@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
    ])
  })
})

describe('suggestGmailContacts', () => {
  it('drops no-reply, notifications, and noreply addresses', () => {
    const messages = [
      ...exchange('No Reply <no-reply@news.test>', '2026-01-01'),
      ...exchange('notifications@shop.test', '2026-01-02'),
      ...exchange('noreply@alerts.test', '2026-01-03'),
    ]
    expect(suggest(messages)).toEqual([])
    expect(isAutomatedAddress('no-reply@news.test')).toBe(true)
    expect(isAutomatedAddress('sam@example.com')).toBe(false)
  })

  it('drops list mail even when the exchange is reciprocal', () => {
    expect(
      suggest([
        message('Letters <letters@club.test>', owner, '2026-01-02', { listUnsubscribe: true }),
        message(owner, 'letters@club.test', '2026-01-03'),
      ]),
    ).toEqual([])
  })

  it('drops one-way addresses and keeps a reciprocal person', () => {
    const suggestions = suggest([
      message('Only Heard <heard@example.com>', owner, '2026-02-01'),
      message(owner, 'only-sent@example.com', '2026-02-02'),
      message(owner, 'Sam <sam@example.com>', '2026-02-03'),
      message('Sam <sam@example.com>', owner, '2026-02-04'),
    ])
    expect(suggestions).toEqual([
      {
        email: 'sam@example.com',
        name: 'Sam',
        messageCount: 2,
        lastMessageOn: '2026-02-04',
      },
    ])
  })

  it('drops the owner and addresses already saved', () => {
    expect(
      suggest(
        [...exchange(owner, '2026-03-01'), ...exchange('ada@example.com', '2026-03-01')],
        ['Ada@Example.com'],
      ),
    ).toEqual([])
  })

  it('ranks by how often they write, then by the newer date', () => {
    const byCount = suggest([
      ...exchange('bea@example.com', '2026-04-01'),
      ...exchange('ada@example.com', '2026-01-01', 2),
    ])
    expect(byCount.map((person) => person.email)).toEqual(['ada@example.com', 'bea@example.com'])

    const byDate = suggest([
      ...exchange('ada@example.com', '2026-01-01'),
      ...exchange('bea@example.com', '2026-06-01'),
    ])
    expect(byDate.map((person) => person.email)).toEqual(['bea@example.com', 'ada@example.com'])
  })

  it('caps the list at 30', () => {
    const messages = Array.from({ length: 31 }, (_, index) =>
      exchange(`p${index}@example.com`, '2026-01-01', index),
    ).flat()
    const suggestions = suggest(messages)
    expect(suggestions).toHaveLength(GMAIL_REVIEW_CAP)
    expect(suggestions.some((person) => person.email === 'p0@example.com')).toBe(false)
    expect(suggestions[0]?.email).toBe('p30@example.com')
  })
})
