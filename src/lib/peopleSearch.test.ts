import { describe, expect, it } from 'vitest'
import { rankPeople } from './peopleSearch'
import type { SearchOption } from './contacts'

function person(id: string, name: string, extra: Partial<SearchOption> = {}): SearchOption {
  return { id, name, email: null, relationship_type: null, ...extra }
}

describe('rankPeople', () => {
  it('puts names starting with the query before names containing it', () => {
    const results = rankPeople([person('1', 'Rosa Park'), person('2', 'Sam Ross'), person('3', 'Ross Geller')], 'ros')
    expect(results.map((row) => row.id)).toEqual(['1', '3', '2'])
  })

  it('still finds people by email or how you know them, after name matches', () => {
    const results = rankPeople(
      [
        person('1', 'Ada Lovelace', { relationship_type: 'mentor' }),
        person('2', 'Mentor Mike'),
        person('3', 'Jo', { email: 'mentorship@example.com' }),
      ],
      'mentor',
    )
    expect(results.map((row) => row.id)).toEqual(['2', '1', '3'])
  })

  it('caps the number of results', () => {
    const many = Array.from({ length: 10 }, (_, index) => person(String(index), `Alex ${index}`))
    expect(rankPeople(many, 'alex')).toHaveLength(6)
    expect(rankPeople(many, 'alex', 3)).toHaveLength(3)
  })

  it('returns nothing for an empty query', () => {
    expect(rankPeople([person('1', 'Maya')], '   ')).toEqual([])
  })
})
