export type DigestContact = {
  id: string
  name: string
  days_overdue: number
}

export function sortDigestContacts(contacts: DigestContact[]) {
  return [...contacts].sort((a, b) => b.days_overdue - a.days_overdue)
}

/**
 * Developer-owned email copy. Names and days overdue only — no notes,
 * birthdays, or relationship text.
 */
export function formatDigestEmail(
  contacts: DigestContact[],
  reachOutUrls: Record<string, string>,
) {
  const ordered = sortDigestContacts(contacts)
  const count = ordered.length
  const people = count === 1 ? '1 person is' : `${count} people are`

  const subject = 'Your weekly relationship check-in'

  const lines = ordered.map((contact) => {
    const overdue =
      contact.days_overdue === 0 ? 'due today' : `${contact.days_overdue} days overdue`
    return `${contact.name} — ${overdue}`
  })

  const textLinks = ordered
    .map((contact) => `Mark ${contact.name} as reached out: ${reachOutUrls[contact.id]}`)
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

  const htmlItems = ordered
    .map((contact) => {
      const overdue =
        contact.days_overdue === 0 ? 'due today' : `${contact.days_overdue} days overdue`
      const url = reachOutUrls[contact.id]
      return `<li>${escapeHtml(contact.name)} — ${overdue}<br /><a href="${escapeHtml(url)}">Mark ${escapeHtml(contact.name)} as reached out</a></li>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html>
<body>
  <p>Your weekly relationship check-in</p>
  <p>${people} overdue:</p>
  <ul>${htmlItems}</ul>
</body>
</html>`

  return { subject, text, html }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
