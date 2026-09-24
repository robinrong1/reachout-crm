import { describe, expect, it } from 'vitest'
import {
  compareOverdue,
  computeRelationshipState,
  isHiddenBySnooze,
  lastContactDate,
  nextDueDate,
  relationshipStateForContact,
} from './overdue'
import type { Contact, Interaction } from '../types/database'

function state(overrides: Partial<Parameters<typeof computeRelationshipState>[0]> = {}) {
  return computeRelationshipState({
    today: '2026-01-31',
    cadenceDays: 30,
    latestOccurredOn: '2026-01-01',
    ...overrides,
  })
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    user_id: 'u1',
    name: 'Sarah',
    relationship_type: 'friend',
    cadence_days: 30,
    birthday: null,
    notes: null,
    phone: null,
    email: null,
    archived: false,
    source: 'manual',
    nudge: null,
    snoozed_until: null,
    created_at: '2025-12-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('overdue business rules', () => {
  it('has no last-talked date when there are no interactions', () => {
    expect(lastContactDate(null)).toBeNull()
  })

  it('uses the latest interaction date when one exists', () => {
    expect(lastContactDate('2026-03-12')).toBe('2026-03-12')
  })

  it('computes next due as last contact plus cadence', () => {
    expect(nextDueDate('2026-01-01', 30)).toBe('2026-01-31')
    expect(nextDueDate('2026-01-01', 14)).toBe('2026-01-15')
  })

  it('treats a person with no conversations as due now', () => {
    const result = state({ latestOccurredOn: null, today: '2026-09-22' })
    expect(result.lastContactDate).toBeNull()
    expect(result.nextDueDate).toBe('2026-09-22')
    expect(result.daysOverdue).toBe(0)
    expect(result.isOverdue).toBe(true)
  })

  it('does not use created_at as a stand-in for last talked', () => {
    const result = relationshipStateForContact(
      contact({ created_at: '2020-01-01T00:00:00.000Z' }),
      [],
      'America/Toronto',
      new Date('2026-09-22T16:00:00.000Z'),
    )
    expect(result.lastContactDate).toBeNull()
    expect(result.daysOverdue).toBe(0)
    expect(result.isOverdue).toBe(true)
  })

  it('is overdue on the due date (days_overdue >= 0)', () => {
    const result = state({ today: '2026-01-31' })
    expect(result.nextDueDate).toBe('2026-01-31')
    expect(result.daysOverdue).toBe(0)
    expect(result.isOverdue).toBe(true)
  })

  it('is not overdue the day before due', () => {
    const result = state({ today: '2026-01-30' })
    expect(result.daysOverdue).toBe(-1)
    expect(result.isOverdue).toBe(false)
  })

  it('sorts by how overdue: shorter cadence is more overdue on the same day', () => {
    const less = state({ today: '2026-02-10', cadenceDays: 30 })
    const more = state({ today: '2026-02-10', cadenceDays: 14 })
    expect(more.daysOverdue).toBeGreaterThan(less.daysOverdue)
  })

  it('is not overdue after logging an interaction for today', () => {
    const result = state({
      today: '2026-02-10',
      latestOccurredOn: '2026-02-10',
      cadenceDays: 30,
    })
    expect(result.lastContactDate).toBe('2026-02-10')
    expect(result.nextDueDate).toBe('2026-03-12')
    expect(result.isOverdue).toBe(false)
  })

  it('picks the latest occurred_on among several interactions', () => {
    const interactions = [
      { id: 'i1', contact_id: 'c1', occurred_on: '2026-01-01', note: null, created_at: '2026-01-01T12:00:00.000Z' },
      { id: 'i2', contact_id: 'c1', occurred_on: '2026-01-20', note: 'later', created_at: '2026-01-20T12:00:00.000Z' },
      { id: 'i3', contact_id: 'c1', occurred_on: '2025-12-15', note: 'earlier', created_at: '2025-12-15T12:00:00.000Z' },
    ] satisfies Interaction[]

    const result = relationshipStateForContact(
      contact(),
      interactions,
      'UTC',
      new Date('2026-01-25T12:00:00.000Z'),
    )

    expect(result.lastContactDate).toBe('2026-01-20')
    expect(result.nextDueDate).toBe('2026-02-19')
    expect(result.isOverdue).toBe(false)
  })

  it('uses the user-local today when deciding overdue', () => {
    const result = relationshipStateForContact(
      contact(),
      [{ id: 'i1', contact_id: 'c1', occurred_on: '2026-09-21', note: null, created_at: '2026-09-21T12:00:00.000Z' }],
      'America/Toronto',
      new Date('2026-09-22T03:00:00.000Z'),
    )
    expect(result.lastContactDate).toBe('2026-09-21')
    expect(result.isOverdue).toBe(false)
  })

  it('ignores future-dated interactions, so they cannot hide someone who is overdue', () => {
    const result = relationshipStateForContact(
      contact({ cadence_days: 1 }),
      [
        { id: 'i1', contact_id: 'c1', occurred_on: '2026-09-01', note: null, created_at: '2026-09-01T12:00:00.000Z' },
        { id: 'i2', contact_id: 'c1', occurred_on: '2026-09-30', note: null, created_at: '2026-09-22T12:00:00.000Z' },
        { id: 'i3', contact_id: 'c1', occurred_on: '2026-10-09', note: null, created_at: '2026-09-22T12:00:00.000Z' },
      ],
      'America/Toronto',
      new Date('2026-09-23T16:00:00.000Z'),
    )
    expect(result.lastContactDate).toBe('2026-09-01')
    expect(result.isOverdue).toBe(true)
    expect(result.daysOverdue).toBe(21)
  })

  it('sorts truly overdue first, never-contacted after anyone due today, with stable ties', () => {
    const rows = [
      { id: 'b', name: 'New Bea', days_overdue: 0, last_contact_date: null },
      { id: 'a', name: 'New Al', days_overdue: 0, last_contact_date: null },
      { id: 'd', name: 'Due Dee', days_overdue: 0, last_contact_date: '2026-09-09' },
      { id: 'l', name: 'Late Lou', days_overdue: 8, last_contact_date: '2026-09-01' },
    ]
    expect([...rows].sort(compareOverdue).map((row) => row.id)).toEqual(['l', 'd', 'a', 'b'])
    expect([...rows].reverse().sort(compareOverdue).map((row) => row.id)).toEqual(['l', 'd', 'a', 'b'])
  })

  it('hides a person until the snooze date, and brings them back that morning', () => {
    expect(isHiddenBySnooze('2026-09-22', '2026-09-29')).toBe(true)
    expect(isHiddenBySnooze('2026-09-29', '2026-09-29')).toBe(false)
    expect(isHiddenBySnooze('2026-09-30', '2026-09-29')).toBe(false)
    expect(isHiddenBySnooze('2026-09-22', null)).toBe(false)
  })
})
