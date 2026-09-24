import { describe, expect, it } from 'vitest'
import { cadencePresetForDays, DEFAULT_CADENCE_DAYS, formatCadence, validateCadenceDays } from './cadence'

describe('cadence presets', () => {
  it('defaults to monthly', () => {
    expect(DEFAULT_CADENCE_DAYS).toBe(30)
    expect(cadencePresetForDays(30)).toBe('monthly')
  })

  it('maps the named presets and treats anything else as custom', () => {
    expect(cadencePresetForDays(7)).toBe('weekly')
    expect(cadencePresetForDays(90)).toBe('quarterly')
    expect(cadencePresetForDays(14)).toBe('custom')
  })

  it('labels presets by name and other cadences in days', () => {
    expect(formatCadence(7)).toBe('Weekly')
    expect(formatCadence(30)).toBe('Monthly')
    expect(formatCadence(90)).toBe('Quarterly')
    expect(formatCadence(14)).toBe('every 14 days')
  })
})

describe('cadence validation', () => {
  it('accepts a missing cadence so the database default (30) can apply', () => {
    expect(validateCadenceDays(undefined)).toBeNull()
  })

  it('accepts whole numbers greater than 0', () => {
    expect(validateCadenceDays(1)).toBeNull()
    expect(validateCadenceDays(14)).toBeNull()
    expect(validateCadenceDays(30)).toBeNull()
  })

  it('rejects zero, negatives, and fractions', () => {
    expect(validateCadenceDays(0)?.message).toMatch(/greater than 0/)
    expect(validateCadenceDays(-7)?.message).toMatch(/greater than 0/)
    expect(validateCadenceDays(1.5)?.message).toMatch(/greater than 0/)
    expect(validateCadenceDays(3650)).toBeNull()
    expect(validateCadenceDays(3651)?.message).toMatch(/at most 3650/)
  })
})
