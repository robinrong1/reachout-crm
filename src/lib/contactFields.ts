export const NUDGE_MAX = 140

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
