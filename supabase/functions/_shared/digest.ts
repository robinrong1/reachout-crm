import { sectionsUnderGroupHeadings } from '../../../src/lib/groupHeadings.ts'
import { compareOverdue } from '../../../src/lib/overdueSort.ts'

export type DigestContact = {
  id: string
  name: string
  days_overdue: number
  last_contact_date?: string | null
  nudge?: string | null
  group_name?: string | null
}

export function sortDigestContacts(contacts: DigestContact[]) {
  return [...contacts].sort(compareOverdue)
}

/**
 * Developer-owned email copy. Names, why they are due, an optional nudge,
 * and a group heading when the person belongs to one. No general notes.
 */
export function formatDigestEmail(
  contacts: DigestContact[],
  reachOutUrls: Record<string, string>,
  snoozeUrls: Record<string, string> = {},
) {
  const ordered = sortDigestContacts(contacts)
  const sections = sectionsUnderGroupHeadings(ordered, (contact) => contact.group_name ?? null)
  const count = ordered.length
  const people = count === 1 ? '1 person is' : `${count} people are`

  const subject = 'Your weekly relationship check-in'

  const lines: string[] = []
  for (const section of sections) {
    if (section.heading) {
      if (lines.length > 0) lines.push('')
      lines.push(section.heading)
    }
    for (const contact of section.items) lines.push(personLine(contact))
  }

  const textLinks = ordered
    .map((contact) => {
      const reach = `Mark ${contact.name} as reached out: ${reachOutUrls[contact.id]}`
      const snooze = snoozeUrls[contact.id]
      return snooze ? `${reach}\nNot this week: ${snooze}` : reach
    })
    .join('\n')

  const text = [
    'Your weekly relationship check-in',
    '',
    `${people} overdue:`,
    '',
    ...lines,
    '',
    textLinks,
  ].join('\n')

  const htmlSections = sections
    .map((section) => {
      const items = section.items.map((contact) => personHtml(contact, reachOutUrls, snoozeUrls)).join('')
      const heading = section.heading ? `<p>${escapeHtml(section.heading)}</p>` : ''
      return `${heading}<ul>${items}</ul>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html>
<body>
  <p>Your weekly relationship check-in</p>
  <p>${people} overdue:</p>
  ${htmlSections}
</body>
</html>`

  return { subject, text, html }
}

function personLine(contact: DigestContact) {
  const overdue = contact.days_overdue === 0 ? 'due today' : `${contact.days_overdue} days overdue`
  const nudge = nudgeLine(contact)
  return nudge ? `${contact.name} — ${overdue}\n${nudge}` : `${contact.name} — ${overdue}`
}

function personHtml(
  contact: DigestContact,
  reachOutUrls: Record<string, string>,
  snoozeUrls: Record<string, string>,
) {
  const overdue = contact.days_overdue === 0 ? 'due today' : `${contact.days_overdue} days overdue`
  const url = reachOutUrls[contact.id]
  const nudge = nudgeLine(contact)
  const nudgeHtml = nudge ? `<br />${escapeHtml(nudge)}` : ''
  const snooze = snoozeUrls[contact.id]
  const snoozeHtml = snooze ? ` · <a href="${escapeHtml(snooze)}">Not this week</a>` : ''
  return `<li>${escapeHtml(contact.name)} — ${overdue}${nudgeHtml}<br /><a href="${escapeHtml(url)}">Mark ${escapeHtml(contact.name)} as reached out</a>${snoozeHtml}</li>`
}

function nudgeLine(contact: DigestContact) {
  const nudge = contact.nudge?.trim() ?? ''
  return nudge
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
