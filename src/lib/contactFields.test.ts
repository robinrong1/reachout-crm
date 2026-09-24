import { describe, expect, it } from 'vitest'
import {
  contactInputErrors,
  isRealIsoDate,
  normalizeNudge,
  normalizePhone,
  validateBirthday,
  validateContactPhone,
} from './contactFields'

describe('normalizeNudge', () => {
  it('keeps a short line, stores blanks as null, and rejects anything over 140', () => {
    expect(normalizeNudge('  Ask about the new job  ').value).toBe('Ask about the new job')
    expect(normalizeNudge('   ').value).toBeNull()
    expect(normalizeNudge(null).value).toBeNull()
    expect(normalizeNudge('x'.repeat(141)).error).toBeInstanceOf(Error)
  })
})

describe('validateContactPhone', () => {
  it('accepts digits with common formatting, and blanks', () => {
    for (const phone of ['5550142387', '13432023162', '+1 (555) 014-2387', '555.014.2387', '', '  ', null, undefined]) {
      expect(validateContactPhone(phone), String(phone)).toBeNull()
    }
  })

  it('rejects letters and implausible lengths', () => {
    for (const phone of ['abc', '555-CALL-NOW', '12345', '1234567890123456', '++15550142387']) {
      expect(validateContactPhone(phone), phone).toBeInstanceOf(Error)
    }
  })
})

describe('normalizePhone', () => {
  it('keeps digits only and stores blanks as null', () => {
    expect(normalizePhone('+1 (555) 014-2387')).toBe('15550142387')
    expect(normalizePhone('13432023162')).toBe('13432023162')
    expect(normalizePhone('  ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('validateBirthday', () => {
  it('accepts past dates and today, rejects future and impossible dates', () => {
    expect(validateBirthday('1991-07-14', '2026-09-23')).toBeNull()
    expect(validateBirthday('2026-09-23', '2026-09-23')).toBeNull()
    expect(validateBirthday('', '2026-09-23')).toBeNull()
    expect(validateBirthday('2999-01-01', '2026-09-23')?.message).toMatch(/future/)
    expect(validateBirthday('1991-02-30', '2026-09-23')?.message).toMatch(/real date/)
    expect(validateBirthday('July 14', '2026-09-23')?.message).toMatch(/real date/)
  })
})

describe('isRealIsoDate', () => {
  it('handles leap years', () => {
    expect(isRealIsoDate('2024-02-29')).toBe(true)
    expect(isRealIsoDate('2026-02-29')).toBe(false)
  })
})

describe('contactInputErrors', () => {
  it('returns every problem, and skips absent fields for partial updates', () => {
    expect(
      contactInputErrors(
        { name: '', cadence_days: 100000, birthday: '2999-01-01', email: 'nope', phone: 'abc' },
        { requireName: true, today: '2026-09-23' },
      ),
    ).toHaveLength(5)
    expect(contactInputErrors({}, { requireName: false, today: '2026-09-23' })).toEqual([])
    expect(contactInputErrors({}, { requireName: true, today: '2026-09-23' })).toEqual(['Name is required'])
  })
})
