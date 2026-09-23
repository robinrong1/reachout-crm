export const GMAIL_REVIEW_CAP = 30

export type GmailHeaderMessage = {
  from: string
  to: string
  cc: string
  date: string
  listUnsubscribe: boolean
}

export type GmailSuggestion = {
  email: string
  name: string
  messageCount: number
  lastMessageOn: string
}

const AUTOMATED_LOCAL =
  /(?:^|[.+_-])(?:no[-_.]?reply|notifications?|notify|do[-_.]?not[-_.]?reply|donotreply|mailer-daemon|bounce|newsletters?)(?:[.+_-]|$)/i

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function parseMailboxes(header: string): { name: string | null; email: string }[] {
  const results: { name: string | null; email: string }[] = []
  let rest = header.trim()

  while (rest.length > 0) {
    rest = rest.replace(/^[\s,;]+/, '')
    if (!rest) break

    if (rest.startsWith('"')) {
      let name = ''
      let index = 1
      while (index < rest.length) {
        const char = rest[index]
        if (char === '\\') {
          name += rest[index + 1] ?? ''
          index += 2
          continue
        }
        if (char === '"') {
          index += 1
          break
        }
        name += char
        index += 1
      }
      const after = rest.slice(index).trimStart()
      const quoted = /^<([^>]+)>/.exec(after)
      if (quoted) {
        pushMailbox(results, name, quoted[1])
        rest = after.slice(quoted[0].length)
        continue
      }
    }

    const angled = /^([^<,]*?)<([^>]+)>/.exec(rest)
    if (angled) {
      pushMailbox(results, angled[1], angled[2])
      rest = rest.slice(angled[0].length)
      continue
    }

    const bare = /^([^,\s;<>"]+@[^,\s;<>"]+)/.exec(rest)
    if (bare) {
      pushMailbox(results, null, bare[1])
      rest = rest.slice(bare[0].length)
      continue
    }

    const comma = rest.indexOf(',')
    if (comma === -1) break
    rest = rest.slice(comma + 1)
  }

  return results
}

function pushMailbox(
  results: { name: string | null; email: string }[],
  name: string | null,
  email: string,
) {
  const normalized = email.trim().toLowerCase()
  if (!EMAIL.test(normalized)) return
  const cleaned = name?.replace(/\s+/g, ' ').trim() ?? ''
  results.push({ name: cleaned || null, email: normalized })
}

export function isAutomatedAddress(email: string) {
  const local = email.split('@')[0] ?? ''
  return AUTOMATED_LOCAL.test(local)
}

function dayFromHeader(value: string) {
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return ''
  return new Date(parsed).toISOString().slice(0, 10)
}

function laterDay(current: string, next: string) {
  if (!current) return next
  if (!next) return current
  return next > current ? next : current
}

type Bucket = {
  email: string
  name: string
  sent: number
  received: number
  listMail: boolean
  lastMessageOn: string
}

function bucketFor(map: Map<string, Bucket>, email: string) {
  const existing = map.get(email)
  if (existing) return existing
  const created: Bucket = {
    email,
    name: '',
    sent: 0,
    received: 0,
    listMail: false,
    lastMessageOn: '',
  }
  map.set(email, created)
  return created
}

function rememberName(bucket: Bucket, name: string | null, day: string) {
  if (!name) return
  if (!bucket.name || (day && day >= bucket.lastMessageOn)) bucket.name = name.slice(0, 200)
}

export function suggestGmailContacts(
  messages: GmailHeaderMessage[],
  options: { ownerEmail: string; excludeEmails?: string[]; limit?: number },
): GmailSuggestion[] {
  const owner = options.ownerEmail.trim().toLowerCase()
  const excluded = new Set((options.excludeEmails ?? []).map((email) => email.trim().toLowerCase()))
  const limit = options.limit ?? GMAIL_REVIEW_CAP
  const people = new Map<string, Bucket>()

  for (const message of messages) {
    const from = parseMailboxes(message.from)[0]
    if (!from) continue
    const day = dayFromHeader(message.date)
    const recipients = new Map<string, string | null>()
    for (const mailbox of [...parseMailboxes(message.to), ...parseMailboxes(message.cc)]) {
      if (!recipients.has(mailbox.email)) recipients.set(mailbox.email, mailbox.name)
    }

    if (from.email === owner) {
      for (const [email, name] of recipients) {
        if (email === owner) continue
        const bucket = bucketFor(people, email)
        bucket.sent += 1
        rememberName(bucket, name, day)
        bucket.lastMessageOn = laterDay(bucket.lastMessageOn, day)
      }
      continue
    }

    const bucket = bucketFor(people, from.email)
    bucket.received += 1
    if (message.listUnsubscribe) bucket.listMail = true
    rememberName(bucket, from.name, day)
    bucket.lastMessageOn = laterDay(bucket.lastMessageOn, day)
  }

  const suggestions: GmailSuggestion[] = []
  for (const bucket of people.values()) {
    if (bucket.email === owner || excluded.has(bucket.email)) continue
    if (isAutomatedAddress(bucket.email) || bucket.listMail) continue
    if (bucket.sent < 1 || bucket.received < 1) continue
    suggestions.push({
      email: bucket.email,
      name: bucket.name || bucket.email,
      messageCount: bucket.sent + bucket.received,
      lastMessageOn: bucket.lastMessageOn,
    })
  }

  suggestions.sort((a, b) => {
    if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount
    if (a.lastMessageOn !== b.lastMessageOn) return a.lastMessageOn < b.lastMessageOn ? 1 : -1
    return a.email.localeCompare(b.email)
  })

  return suggestions.slice(0, limit)
}
