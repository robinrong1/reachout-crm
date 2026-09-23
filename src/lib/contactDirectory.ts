import type { ContactListItem } from './contacts'

export type DirectorySort = 'name' | 'cadence' | 'last_talked'
export type SortDir = 'asc' | 'desc'

export function filterDirectory(
  contacts: ContactListItem[],
  query: string,
  groupId: string | 'all',
) {
  const q = query.trim().toLowerCase()
  return contacts.filter((contact) => {
    if (groupId !== 'all' && !contact.group_ids.includes(groupId)) return false
    if (!q) return true
    const relationship = (contact.relationship_type ?? '').toLowerCase()
    return contact.name.toLowerCase().includes(q) || relationship.includes(q)
  })
}

export function sortDirectory(contacts: ContactListItem[], sort: DirectorySort, dir: SortDir) {
  const copy = [...contacts]
  copy.sort((a, b) => {
    if (sort === 'name') {
      const cmp = a.name.localeCompare(b.name)
      return dir === 'asc' ? cmp : -cmp
    }
    if (sort === 'cadence') {
      const cmp = a.cadence_days - b.cadence_days
      return dir === 'asc' ? cmp : -cmp
    }
    const av = a.last_occurred_on
    const bv = b.last_occurred_on
    if (!av && !bv) return 0
    if (!av) return 1
    if (!bv) return -1
    const cmp = av.localeCompare(bv)
    return dir === 'asc' ? cmp : -cmp
  })
  return copy
}
