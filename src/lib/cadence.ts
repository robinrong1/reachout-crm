export const CADENCE_PRESETS = [
  { id: 'weekly', label: 'Weekly', days: 7 },
  { id: 'monthly', label: 'Monthly', days: 30 },
  { id: 'quarterly', label: 'Quarterly', days: 90 },
] as const

export const DEFAULT_CADENCE_DAYS = 30

export type CadencePresetId = (typeof CADENCE_PRESETS)[number]['id']

export function cadencePresetForDays(days: number): CadencePresetId | 'custom' {
  return CADENCE_PRESETS.find((preset) => preset.days === days)?.id ?? 'custom'
}

/** Weekly / Monthly / Quarterly, or "every N days" for any other cadence. */
export function formatCadence(days: number) {
  const preset = CADENCE_PRESETS.find((item) => item.days === days)
  if (preset) return preset.label
  return `every ${days} days`
}

/** Cadence is a whole number of days greater than 0 (matches the DB check). */
export function validateCadenceDays(cadenceDays: number | undefined) {
  if (cadenceDays == null) return null
  if (!Number.isInteger(cadenceDays) || cadenceDays <= 0) {
    return new Error('Cadence must be a whole number of days greater than 0')
  }
  return null
}
