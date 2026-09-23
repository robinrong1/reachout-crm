import { describe, expect, it } from 'vitest'
import { buildCatchUp, buildUpcomingBirthdays, catchUpCardCopy, groupHomeFeed, joinNames } from './home'
import type { ContactListItem } from './contacts'
import type { OverdueContact } from './overdue'

function person(overrides: Partial<ContactListItem> & Pick<ContactListItem, 'id' | 'name'>): ContactListItem {
  return {
    user_id: 'u1',
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
    created_at: '2026-01-01T12:00:00.000Z',
    last_occurred_on: '2026-09-01',
    group_ids: [],
    ...overrides,
  }
}

function overdue(overrides: Partial<OverdueContact> & Pick<OverdueContact, 'id' | 'name'>): OverdueContact {
  return {
    user_id: 'u1',
    relationship_type: null,
    cadence_days: 30,
    phone: null,
    email: null,
    last_contact_date: '2026-08-01',
    next_due_date: '2026-08-31',
    days_overdue: 21,
    nudge: null,
    snoozed_until: null,
    ...overrides,
  }
}

describe('joinNames', () => {
  it('names one or two people in a sentence', () => {
    expect(joinNames(['Maya'])).toBe('Maya')
    expect(joinNames(['Maya', 'Jordan'])).toBe('Maya and Jordan')
  })

  it('caps the named people and counts the rest', () => {
    expect(joinNames(['Maya', 'Jordan', 'Sam'])).toBe('Maya, Jordan, and 1 other')
    expect(joinNames(['A', 'B', 'C', 'D'])).toBe('A, B, and 2 others')
  })
})

describe('catchUpCardCopy', () => {
  it('links to Catch up when someone is overdue', () => {
    expect(
      catchUpCardCopy([{ id: '1', name: 'Maya', kind: 'overdue', daysOverdue: 3, nudge: null }]),
    ).toEqual({
      title: 'Catch up with Maya.',
      body: '1 person is overdue. The full list is on Catch up.',
      linkToCatchUp: true,
    })
  })

  it('does not send you to Catch up when everyone is only due soon', () => {
    expect(
      catchUpCardCopy([
        { id: '1', name: 'Maya', kind: 'due_soon', daysOverdue: -2, nudge: null },
        { id: '2', name: 'Jordan', kind: 'due_soon', daysOverdue: -4, nudge: null },
      ]),
    ).toEqual({
      title: 'Maya and Jordan are due soon.',
      body: 'Say hello when you have a minute.',
      linkToCatchUp: false,
    })
  })
})

describe('buildCatchUp', () => {
  it('keeps overdue people from the view and adds due-soon from cadence', () => {
    const items = buildCatchUp(
      [overdue({ id: '1', name: 'Overdue Ann', days_overdue: 12 })],
      [
        person({ id: '1', name: 'Overdue Ann', last_occurred_on: '2026-08-01' }),
        person({ id: '2', name: 'Soon Sam', cadence_days: 14, last_occurred_on: '2026-09-10' }),
        person({ id: '3', name: 'Later Lee', cadence_days: 90, last_occurred_on: '2026-08-01' }),
      ],
      '2026-09-21',
    )

    expect(items.map((item) => item.id)).toEqual(['1', '2'])
    expect(items[0]?.kind).toBe('overdue')
    expect(items[1]).toMatchObject({ id: '2', kind: 'due_soon' })
  })

  it('does not treat the day before due as overdue', () => {
    const items = buildCatchUp(
      [],
      [person({ id: '2', name: 'Soon Sam', cadence_days: 14, last_occurred_on: '2026-09-08' })],
      '2026-09-21',
    )
    expect(items).toEqual([
      expect.objectContaining({ id: '2', kind: 'due_soon', daysOverdue: -1 }),
    ])
  })

  it('leaves out someone snoozed past today, and includes them the morning the snooze ends', () => {
    const hidden = buildCatchUp(
      [overdue({ id: '1', name: 'Ann', days_overdue: 4, snoozed_until: '2026-09-29' })],
      [person({ id: '2', name: 'Sam', cadence_days: 14, last_occurred_on: '2026-09-10', snoozed_until: '2026-09-29' })],
      '2026-09-22',
    )
    expect(hidden).toEqual([])

    const back = buildCatchUp(
      [overdue({ id: '1', name: 'Ann', days_overdue: 4, snoozed_until: '2026-09-22' })],
      [],
      '2026-09-22',
    )
    expect(back.map((item) => item.id)).toEqual(['1'])
  })
})

describe('buildUpcomingBirthdays', () => {
  it('includes birthdays in the next 7 days, including today', () => {
    const items = buildUpcomingBirthdays(
      [
        person({ id: '1', name: 'Today', birthday: '1990-09-21' }),
        person({ id: '2', name: 'Thursday', birthday: '1991-09-24' }),
        person({ id: '3', name: 'Too far', birthday: '1990-10-10' }),
        person({ id: '4', name: 'No date', birthday: null }),
      ],
      '2026-09-21',
    )
    expect(items.map((item) => item.id)).toEqual(['1', '2'])
    expect(items[0]?.daysUntil).toBe(0)
    expect(items[1]?.daysUntil).toBe(3)
  })
})

describe('groupHomeFeed', () => {
  it('puts today birthdays in TODAY and catch-up in THIS WEEK', () => {
    const sections = groupHomeFeed(
      [{ id: 'c', name: 'Ann', kind: 'overdue', daysOverdue: 4, nudge: null }],
      [
        { id: '1', name: 'Today', nextOn: '2026-09-21', daysUntil: 0 },
        { id: '2', name: 'Thu', nextOn: '2026-09-24', daysUntil: 3 },
      ],
    )
    expect(sections.map((section) => section.label)).toEqual(['TODAY', 'THIS WEEK'])
    expect(sections[0]?.birthdays.map((item) => item.id)).toEqual(['1'])
    expect(sections[1]?.catchUp).toHaveLength(1)
    expect(sections[1]?.birthdays.map((item) => item.id)).toEqual(['2'])
  })

  it('omits empty groups', () => {
    expect(groupHomeFeed([], [])).toEqual([])
  })
})
