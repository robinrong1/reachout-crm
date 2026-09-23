import { describe, expect, it } from 'vitest'
import { daysUntilBirthday, nextBirthdayOn } from './birthdays'

describe('nextBirthdayOn', () => {
  it('uses this year when the date has not passed', () => {
    expect(nextBirthdayOn('1990-09-24', '2026-09-21')).toBe('2026-09-24')
  })

  it('includes today', () => {
    expect(nextBirthdayOn('1990-09-21', '2026-09-21')).toBe('2026-09-21')
  })

  it('rolls to next year after the date has passed', () => {
    expect(nextBirthdayOn('1990-03-01', '2026-09-21')).toBe('2027-03-01')
  })

  it('observes Feb 29 on Mar 1 in a non-leap year', () => {
    expect(nextBirthdayOn('1992-02-29', '2026-01-01')).toBe('2026-03-01')
    expect(nextBirthdayOn('1992-02-29', '2026-03-02')).toBe('2027-03-01')
  })

  it('keeps Feb 29 in a leap year', () => {
    expect(nextBirthdayOn('1992-02-29', '2028-01-01')).toBe('2028-02-29')
  })
})

describe('daysUntilBirthday', () => {
  it('is 0 on the birthday', () => {
    expect(daysUntilBirthday('1990-09-21', '2026-09-21')).toBe(0)
  })

  it('counts remaining days this year', () => {
    expect(daysUntilBirthday('1990-09-24', '2026-09-21')).toBe(3)
  })
})
