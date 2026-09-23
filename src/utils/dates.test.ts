import { describe, expect, it } from 'vitest'
import {
  addDays,
  calendarDateInTimeZone,
  diffDays,
  formatMonthDay,
  formatMonthHeading,
  formatWeekday,
  todayInTimeZone,
} from './dates'

describe('addDays (Postgres date + int)', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01')
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01')
  })

  it('supports negative offsets used to plant overdue history', () => {
    expect(addDays('2026-03-10', -40)).toBe('2026-01-29')
  })
})

describe('diffDays (Postgres date - date)', () => {
  it('is signed whole calendar days', () => {
    expect(diffDays('2026-02-10', '2026-02-01')).toBe(9)
    expect(diffDays('2026-02-01', '2026-02-10')).toBe(-9)
    expect(diffDays('2026-01-01', '2026-01-01')).toBe(0)
  })
})

describe('timezone calendar dates', () => {
  it('uses the user local date, not UTC, around midnight', () => {
    const instant = new Date('2026-01-02T03:00:00.000Z')
    expect(calendarDateInTimeZone(instant, 'UTC')).toBe('2026-01-02')
    expect(calendarDateInTimeZone(instant, 'America/Toronto')).toBe('2026-01-01')
  })

  it('does not skip a calendar date across a DST spring-forward', () => {
    const before = new Date('2026-03-08T06:30:00.000Z')
    const after = new Date('2026-03-08T08:30:00.000Z')
    expect(calendarDateInTimeZone(before, 'America/New_York')).toBe('2026-03-08')
    expect(calendarDateInTimeZone(after, 'America/New_York')).toBe('2026-03-08')
  })

  it('todayInTimeZone is calendarDateInTimeZone of now', () => {
    const now = new Date('2026-09-21T04:00:00.000Z')
    expect(todayInTimeZone('UTC', now)).toBe('2026-09-21')
    expect(todayInTimeZone('America/Toronto', now)).toBe('2026-09-21')
    expect(todayInTimeZone('Pacific/Auckland', now)).toBe('2026-09-21')
    expect(todayInTimeZone('America/Los_Angeles', now)).toBe('2026-09-20')
  })
})

describe('formatMonthHeading', () => {
  it('uppercases month and year', () => {
    expect(formatMonthHeading('2026-09-21')).toBe('SEP 2026')
    expect(formatMonthHeading('2026-01-01')).toBe('JAN 2026')
  })
})

describe('home date labels', () => {
  it('formats weekday and month-day without a year', () => {
    expect(formatWeekday('2026-09-24')).toBe('Thursday')
    expect(formatMonthDay('2026-09-24')).toBe('Sep 24')
  })
})
