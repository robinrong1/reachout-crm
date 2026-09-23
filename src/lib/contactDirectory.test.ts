import { describe, expect, it } from 'vitest'
import { filterDirectory, sortDirectory } from './contactDirectory'
import type { ContactListItem } from './contacts'

function person(overrides: Partial<ContactListItem> & Pick<ContactListItem, 'id' | 'name'>): ContactListItem {
  return {
    user_id: 'u',
    relationship_type: null,
    cadence_days: 30,
    birthday: null,
    notes: null,
    phone: null,
    email: null,
    archived: false,
    source: 'manual',
    nudge: null,
    snoozed_until: null,
    created_at: '2026-01-01T00:00:00Z',
    last_occurred_on: null,
    group_ids: [],
    ...overrides,
  }
}

describe('filterDirectory', () => {
  const rows = [
    person({ id: '1', name: 'Zach', relationship_type: 'friend', group_ids: ['g1'] }),
    person({ id: '2', name: 'Maya', relationship_type: 'sister', group_ids: ['g2'] }),
  ]

  it('filters by name or how you know them', () => {
    expect(filterDirectory(rows, 'za', 'all').map((c) => c.id)).toEqual(['1'])
    expect(filterDirectory(rows, 'sister', 'all').map((c) => c.id)).toEqual(['2'])
  })

  it('filters by group without hiding All', () => {
    expect(filterDirectory(rows, '', 'all')).toHaveLength(2)
    expect(filterDirectory(rows, '', 'g1').map((c) => c.id)).toEqual(['1'])
  })
})

describe('sortDirectory', () => {
  const rows = [
    person({ id: '1', name: 'Zach', cadence_days: 14, last_occurred_on: '2026-01-01' }),
    person({ id: '2', name: 'Amy', cadence_days: 60, last_occurred_on: null }),
    person({ id: '3', name: 'Maya', cadence_days: 30, last_occurred_on: '2026-03-01' }),
  ]

  it('sorts by name', () => {
    expect(sortDirectory(rows, 'name', 'asc').map((c) => c.name)).toEqual(['Amy', 'Maya', 'Zach'])
  })

  it('sorts last talked with never at the end', () => {
    expect(sortDirectory(rows, 'last_talked', 'desc').map((c) => c.id)).toEqual(['3', '1', '2'])
  })
})
