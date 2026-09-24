import { validateCadenceDays } from './cadence.ts'

export const NUDGE_MAX = 140

type ContactFieldsInput = {
  name?: string
  cadence_days?: number
  birthday?: string | null
  email?: string | null
  phone?: string | null
  nudge?: string | null
}

/**
 * Every problem with the given fields, not just the first. Fields that are absent
 * are skipped, so this works for partial updates; pass requireName for creates.
 */
export function contactInputErrors(input: ContactFieldsInput, options: { requireName: boolean; today: string }) {
  const errors = [
    options.requireName || input.name != null ? validateContactName(input.name) : null,
    validateCadenceDays(input.cadence_days),
    validateBirthday(input.birthday, options.today),
    validateContactEmail(input.email),
    validateContactPhone(input.phone),
    normalizeNudge(input.nudge).error,
  ]
  return errors.filter((error): error is Error => error != null).map((error) => error.message)
}

export function combinedError(messages: string[]) {
  return messages.length === 0 ? null : new Error(messages.join('; '))
}

export function normalizeNudge(value: string | null | undefined) {
  if (value == null) return { value: null as string | null, error: null }
  const trimmed = value.trim()
  if (!trimmed) return { value: null as string | null, error: null }
  if (trimmed.length > NUDGE_MAX) {
    return { value: null as string | null, error: new Error(`Keep the nudge to ${NUDGE_MAX} characters`) }
  }
  return { value: trimmed, error: null }
}

export function validateContactName(name: string | undefined) {
  if (!name?.trim()) return new Error('Name is required')
  return null
}

export function validateContactEmail(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return new Error('Email should look like name@example.com')
  }
  return null
}

/** Digits with optional +, spaces, dashes, dots, and parentheses; 7–15 digits (E.164 max). */
export function validateContactPhone(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, '').length
  if (!/^\+?[\d\s().-]+$/.test(trimmed) || digits < 7 || digits > 15) {
    return new Error('Phone should be 7 to 15 digits, like 5550142387 or +1 555 014 2387')
  }
  return null
}

/** A real calendar date as YYYY-MM-DD (rejects 2026-02-30). */
export function isRealIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

/** `today` is YYYY-MM-DD; ISO dates compare correctly as strings. */
export function validateBirthday(value: string | null | undefined, today: string) {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!isRealIsoDate(trimmed)) return new Error('Birthday must be a real date as YYYY-MM-DD')
  if (trimmed > today) return new Error('Birthday cannot be in the future')
  return null
}
