export type NamedGroup = {
  id: string
  name: string
}

export type HeadingSection<T> = {
  heading: string | null
  items: T[]
}

/** Alphabetically first group this person belongs to. No membership means the main list. */
export function primaryGroupName(groupIds: readonly string[], groups: readonly NamedGroup[]) {
  const names = groups
    .filter((group) => groupIds.includes(group.id))
    .map((group) => group.name.trim())
    .filter((name) => name.length > 0)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return names[0] ?? null
}

/**
 * People with no group stay in the main list. Everyone else appears once,
 * under that primary group name. Order inside a section is unchanged.
 */
export function sectionsUnderGroupHeadings<T>(
  items: readonly T[],
  groupNameFor: (item: T) => string | null,
): HeadingSection<T>[] {
  const main: T[] = []
  const byHeading = new Map<string, T[]>()

  for (const item of items) {
    const heading = groupNameFor(item)?.trim() || null
    if (!heading) {
      main.push(item)
      continue
    }
    const list = byHeading.get(heading) ?? []
    list.push(item)
    byHeading.set(heading, list)
  }

  const named = [...byHeading.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
    .map(([heading, sectionItems]) => ({ heading, items: sectionItems }))

  const sections: HeadingSection<T>[] = []
  if (main.length > 0) sections.push({ heading: null, items: main })
  sections.push(...named)
  return sections
}

/** Cadence written onto current members of one group. People outside that group are left out. */
export function cadenceForCurrentMembers(
  memberships: readonly { contactId: string; groupId: string }[],
  groupId: string,
  cadenceDays: number,
) {
  const seen = new Set<string>()
  const writes: { contactId: string; cadenceDays: number }[] = []
  for (const row of memberships) {
    if (row.groupId !== groupId || seen.has(row.contactId)) continue
    seen.add(row.contactId)
    writes.push({ contactId: row.contactId, cadenceDays })
  }
  return writes
}
