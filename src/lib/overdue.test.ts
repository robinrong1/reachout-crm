import { describe, expect, it } from 'vitest'
import { computeRelationshipState, lastContactDate, nextDueDate } from './overdue'
import { addDays, calendarDateInTimeZone, diffDays } from '../utils/dates'

describe('date helpers', () => {
  it('adds calendar days like Postgres date + int', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('diffs calendar days like Postgres date - date', () => {
    expect(diffDays('2026-02-10', '2026-02-01')).toBe(9)
    expect(diffDays('2026-02-01', '2026-02-10')).toBe(-9)
  })

  it('converts a timestamptz to the user local calendar date', () => {
    const instant = new Date('2026-01-02T03:00:00.000Z')
    expect(calendarDateInTimeZone(instant, 'UTC')).toBe('2026-01-02')
    expect(calendarDateInTimeZone(instant, 'America/Toronto')).toBe('2026-01-01')
  })
})

describe('overdue business rules', () => {
  it('uses created_at as the baseline when there are no interactions', () => {
    expect(lastContactDate(null, '2026-01-01')).toBe('2026-01-01')
  })

  it('uses the latest interaction date when one exists', () => {
    expect(lastContactDate('2026-03-12', '2026-01-01')).toBe('2026-03-12')
  })

  it('computes next due as last contact plus cadence', () => {
    expect(nextDueDate('2026-01-01', 30)).toBe('2026-01-31')
    expect(nextDueDate('2026-01-01', 14)).toBe('2026-01-15')
  })

  it('is overdue on the due date (days_overdue >= 0)', () => {
    const state = computeRelationshipState({
      today: '2026-01-31',
      cadenceDays: 30,
      latestOccurredOn: '2026-01-01',
      createdAt: '2025-12-01T12:00:00.000Z',
      timeZone: 'UTC',
    })

    expect(state.nextDueDate).toBe('2026-01-31')
    expect(state.daysOverdue).toBe(0)
    expect(state.isOverdue).toBe(true)
  })

  it('is not overdue the day before due', () => {
    const state = computeRelationshipState({
      today: '2026-01-30',
      cadenceDays: 30,
      latestOccurredOn: '2026-01-01',
      createdAt: '2025-12-01T12:00:00.000Z',
      timeZone: 'UTC',
    })

    expect(state.daysOverdue).toBe(-1)
    expect(state.isOverdue).toBe(false)
  })

  it('sorts by how overdue: later today means a larger days_overdue', () => {
    const less = computeRelationshipState({
      today: '2026-02-10',
      cadenceDays: 30,
      latestOccurredOn: '2026-01-01',
      createdAt: '2025-12-01T12:00:00.000Z',
      timeZone: 'UTC',
    })
    const more = computeRelationshipState({
      today: '2026-02-10',
      cadenceDays: 14,
      latestOccurredOn: '2026-01-01',
      createdAt: '2025-12-01T12:00:00.000Z',
      timeZone: 'UTC',
    })

    expect(more.daysOverdue).toBeGreaterThan(less.daysOverdue)
  })

  it('uses the local created_at date when there are no interactions', () => {
    const state = computeRelationshipState({
      today: '2026-01-31',
      cadenceDays: 30,
      latestOccurredOn: null,
      createdAt: '2026-01-02T03:00:00.000Z',
      timeZone: 'America/Toronto',
    })

    expect(state.lastContactDate).toBe('2026-01-01')
    expect(state.nextDueDate).toBe('2026-01-31')
    expect(state.isOverdue).toBe(true)
  })
})
