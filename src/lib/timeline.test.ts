import { describe, expect, it } from 'vitest'
import { attachContactNames, groupTimelineByMonth, timelineEventLabel, timelineNoteBody, type TimelineItem } from './timeline'
import type { Interaction } from '../types/database'

function item(overrides: Partial<TimelineItem> & Pick<TimelineItem, 'id' | 'occurred_on'>): TimelineItem {
  return {
    contact_id: 'c',
    note: null,
    created_at: '2026-01-01T00:00:00Z',
    contact_name: 'Maya',
    archived: false,
    ...overrides,
  }
}

describe('timeline event copy', () => {
  it('calls a date-only reach-out Reached out and hides an empty body', () => {
    expect(timelineEventLabel(null)).toBe('Reached out')
    expect(timelineEventLabel('   ')).toBe('Reached out')
    expect(timelineNoteBody(null)).toBeNull()
    expect(timelineNoteBody('  ')).toBeNull()
  })

  it('calls a written note Added a note and keeps the body', () => {
    expect(timelineEventLabel('coffee')).toBe('Added a note')
    expect(timelineNoteBody(' coffee ')).toBe('coffee')
  })
})

describe('groupTimelineByMonth', () => {
  it('keeps newest-first months and order within a month', () => {
    const grouped = groupTimelineByMonth([
      item({ id: '1', occurred_on: '2026-03-12', contact_name: 'Sarah', note: 'coffee' }),
      item({ id: '2', occurred_on: '2026-03-01', contact_name: 'Maya' }),
      item({ id: '3', occurred_on: '2026-02-03', contact_name: 'Jamie' }),
    ])
    expect(grouped.map((month) => month.key)).toEqual(['2026-03', '2026-02'])
    expect(grouped[0].items.map((row) => row.id)).toEqual(['1', '2'])
  })

  it('returns an empty list when there are no conversations', () => {
    expect(groupTimelineByMonth([])).toEqual([])
  })
})

describe('attachContactNames', () => {
  it('labels a note with the contact on the interaction, not some other person', () => {
    const interactions: Interaction[] = [
      {
        id: 'i1',
        contact_id: 'maya-id',
        occurred_on: '2026-10-01',
        note: 'chatter',
        created_at: '2026-10-01T00:00:00Z',
      },
    ]
    const items = attachContactNames(interactions, [
      { id: 'robin-id', name: 'Robin', archived: false },
      { id: 'maya-id', name: 'Maya', archived: false },
    ])
    expect(items[0]?.contact_name).toBe('Maya')
    expect(items[0]?.contact_id).toBe('maya-id')
  })
})
