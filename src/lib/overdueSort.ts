type OverdueSortable = {
  id: string
  name: string
  days_overdue: number | null
  last_contact_date?: string | null
}

/**
 * Most overdue first. Never-contacted people (days_overdue 0) sort after anyone
 * actually late, including those due today. Name, then id, keeps ties stable.
 */
export function compareOverdue(a: OverdueSortable, b: OverdueSortable) {
  const byDays = (b.days_overdue ?? 0) - (a.days_overdue ?? 0)
  if (byDays !== 0) return byDays
  const neverA = a.last_contact_date === null ? 1 : 0
  const neverB = b.last_contact_date === null ? 1 : 0
  return neverA - neverB || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}
