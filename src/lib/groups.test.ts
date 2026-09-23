import { describe, expect, it } from 'vitest'
import { cadenceForCurrentMembers, primaryGroupName, sectionsUnderGroupHeadings } from './groupHeadings'
import { GROUPS_SCHEMA_MISSING, isMissingGroupsSchema, validateGroupName } from './groups'

describe('missing groups schema', () => {
  it('treats PostgREST schema-cache misses as not deployed yet', () => {
    expect(
      isMissingGroupsSchema({
        code: 'PGRST205',
        message: "Could not find the table 'public.contact_groups' in the schema cache",
      }),
    ).toBe(true)
    expect(isMissingGroupsSchema({ code: '42P01', message: 'relation "groups" does not exist' })).toBe(true)
    expect(isMissingGroupsSchema({ message: 'permission denied' })).toBe(false)
    expect(isMissingGroupsSchema(null)).toBe(false)
  })

  it('explains writes when groups tables are missing', () => {
    expect(GROUPS_SCHEMA_MISSING.message).toMatch(/schema\.sql/)
  })
})

describe('group name validation', () => {
  it('requires a non-empty name', () => {
    expect(validateGroupName(undefined)?.message).toMatch(/name/)
    expect(validateGroupName('')?.message).toMatch(/name/)
    expect(validateGroupName('   ')?.message).toMatch(/name/)
  })

  it('accepts a trimmed name', () => {
    expect(validateGroupName('Family')).toBeNull()
    expect(validateGroupName('  college  ')).toBeNull()
  })

  it('rejects names longer than 40 characters', () => {
    expect(validateGroupName('a'.repeat(41))?.message).toMatch(/40/)
  })
})

const groups = [
  { id: 'fam', name: 'Family' },
  { id: 'col', name: 'College' },
]

describe('group headings', () => {
  it('puts a member under that group and leaves an ungrouped person in the main list', () => {
    const people = [
      { id: 'mom', name: 'Mom' },
      { id: 'sam', name: 'Sam' },
    ]
    const sections = sectionsUnderGroupHeadings(people, (person) =>
      primaryGroupName(person.id === 'mom' ? ['fam'] : [], groups),
    )
    expect(sections).toEqual([
      { heading: null, items: [{ id: 'sam', name: 'Sam' }] },
      { heading: 'Family', items: [{ id: 'mom', name: 'Mom' }] },
    ])
  })

  it('lists a person in two groups once, under the first name alphabetically', () => {
    expect(primaryGroupName(['fam', 'col'], groups)).toBe('College')
    const sections = sectionsUnderGroupHeadings([{ id: 'ada', name: 'Ada' }], () => 'College')
    expect(sections).toEqual([{ heading: 'College', items: [{ id: 'ada', name: 'Ada' }] }])
    expect(sections.flatMap((section) => section.items)).toHaveLength(1)
  })
})

describe('group cadence confirm', () => {
  it('updates current members and leaves everyone else alone', () => {
    const memberships = [
      { contactId: 'mom', groupId: 'fam' },
      { contactId: 'dad', groupId: 'fam' },
      { contactId: 'sam', groupId: 'col' },
    ]
    expect(cadenceForCurrentMembers(memberships, 'fam', 30)).toEqual([
      { contactId: 'mom', cadenceDays: 30 },
      { contactId: 'dad', cadenceDays: 30 },
    ])
    expect(cadenceForCurrentMembers(memberships, 'fam', 30).some((row) => row.contactId === 'sam')).toBe(false)
  })
})
