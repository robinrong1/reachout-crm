import type { Interaction } from '../types/database.ts'

export type TimelineItem = Interaction & {
  contact_name: string
  archived: boolean
}

export type TimelineMonth = {
  key: string
  items: TimelineItem[]
}

type ContactNameRow = {
  id: string
  name: string
  archived: boolean
}

/** Date-only reach-outs are not notes. A label mentions a note only when one was written. */
export function timelineEventLabel(note: string | null | undefined) {
  const trimmed = note?.trim() ?? ''
  return trimmed ? 'Added a note' : 'Reached out'
}

export function timelineNoteBody(note: string | null | undefined) {
  const trimmed = note?.trim() ?? ''
  return trimmed ? trimmed : null
}

/** Name the other person on each note. Never uses the signed-in user. */
export function attachContactNames(interactions: Interaction[], contacts: ContactNameRow[]): TimelineItem[] {
  const byId = new Map(contacts.map((contact) => [contact.id, contact]))
  return interactions.map((row) => {
    const contact = byId.get(row.contact_id)
    return {
      id: row.id,
      contact_id: row.contact_id,
      occurred_on: row.occurred_on,
      note: row.note,
      created_at: row.created_at,
      contact_name: contact?.name ?? 'Unknown',
      archived: contact?.archived ?? false,
    }
  })
}

/** Group a newest-first list into months, preserving order. */
export function groupTimelineByMonth(items: TimelineItem[]): TimelineMonth[] {
  const months: TimelineMonth[] = []
  for (const item of items) {
    const key = item.occurred_on.slice(0, 7)
    const last = months[months.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      months.push({ key, items: [item] })
    }
  }
  return months
}
