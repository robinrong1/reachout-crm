import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'
import type { Contact, ContactInsert, ContactUpdate, Database } from '../types/database.ts'
import { addDays, localToday } from '../utils/dates.ts'
import { combinedError, contactInputErrors, normalizeNudge, normalizePhone } from './contactFields.ts'
import { isMissingGroupsSchema } from './groups.ts'

export type Db = SupabaseClient<Database>

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

async function requireUserId(db: Db = supabase) {
  const { data, error } = await db.auth.getUser()
  if (error) return { userId: null, error }
  if (!data.user) return { userId: null, error: new Error('Not signed in') }
  return { userId: data.user.id, error: null }
}

export function contactMatchesQuery(
  contact: Pick<Contact, 'name' | 'email' | 'relationship_type'>,
  query: string,
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [contact.name, contact.email ?? '', contact.relationship_type ?? ''].join('\n').toLowerCase()
  return haystack.includes(needle)
}

export type ContactListItem = Contact & {
  last_occurred_on: string | null
  group_ids: string[]
}

export async function listContacts(archived: boolean) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('archived', archived)
    .order('name', { ascending: true })

  if (error) return { data: null as ContactListItem[] | null, error }

  const contacts = (data ?? []) as Contact[]
  if (contacts.length === 0) return { data: [] as ContactListItem[], error: null }

  const ids = contacts.map((contact) => contact.id)

  const { data: interactions, error: interactionError } = await supabase
    .from('interactions')
    .select('contact_id, occurred_on')
    .in('contact_id', ids)

  if (interactionError) return { data: null as ContactListItem[] | null, error: interactionError }

  const { data: memberships, error: membershipError } = await supabase
    .from('contact_groups')
    .select('contact_id, group_id')
    .in('contact_id', ids)

  if (membershipError) {
    if (!isMissingGroupsSchema(membershipError)) {
      return { data: null as ContactListItem[] | null, error: membershipError }
    }
  }

  const today = localToday()
  const latest = new Map<string, string>()
  for (const row of interactions ?? []) {
    if (row.occurred_on > today) continue
    const current = latest.get(row.contact_id)
    if (!current || row.occurred_on > current) latest.set(row.contact_id, row.occurred_on)
  }

  const groupsByContact = new Map<string, string[]>()
  for (const row of memberships ?? []) {
    const current = groupsByContact.get(row.contact_id) ?? []
    current.push(row.group_id)
    groupsByContact.set(row.contact_id, current)
  }

  return {
    data: contacts.map((contact) => ({
      ...contact,
      last_occurred_on: latest.get(contact.id) ?? null,
      group_ids: groupsByContact.get(contact.id) ?? [],
    })),
    error: null,
  }
}

export async function countContacts() {
  const { count, error } = await supabase.from('contacts').select('id', { count: 'exact', head: true })
  return { count: count ?? 0, error }
}

export async function listActiveContactOptions() {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('archived', false)
    .order('name', { ascending: true })

  return { data: (data ?? null) as { id: string; name: string }[] | null, error }
}

export type SearchOption = Pick<Contact, 'id' | 'name' | 'email' | 'relationship_type'>

export async function listSearchOptions() {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, email, relationship_type')
    .eq('archived', false)
    .order('name', { ascending: true })

  return { data: (data ?? null) as SearchOption[] | null, error }
}

export async function findContacts(query: string, db: Db = supabase) {
  const { data, error } = await db
    .from('contacts')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true })

  if (error) return { data: null as Contact[] | null, error }
  const matches = ((data ?? []) as Contact[]).filter((contact) => contactMatchesQuery(contact, query))
  return { data: matches, error: null }
}

export async function getContact(id: string, db: Db = supabase) {
  const { data, error } = await db.from('contacts').select('*').eq('id', id).maybeSingle()

  return { data: (data ?? null) as Contact | null, error }
}

/**
 * Pass `userId` when `db` is an accessToken client (the MCP server): those clients
 * throw on any `db.auth` access. RLS still requires it to match the JWT subject.
 */
export async function createContact(
  input: ContactInsert,
  db: Db = supabase,
  options: { userId?: string; today?: string } = {},
) {
  const invalid = combinedError(contactInputErrors(input, { requireName: true, today: options.today ?? localToday() }))
  if (invalid) return { data: null, error: invalid }
  const nudge = normalizeNudge(input.nudge)

  const owner = options.userId ? { userId: options.userId, error: null } : await requireUserId(db)
  if (owner.error || !owner.userId) return { data: null, error: owner.error }

  const row: Database['public']['Tables']['contacts']['Insert'] = {
    user_id: owner.userId,
    name: input.name.trim(),
    relationship_type: emptyToNull(input.relationship_type),
    cadence_days: input.cadence_days ?? 30,
    birthday: emptyToNull(input.birthday),
    notes: emptyToNull(input.notes),
    phone: normalizePhone(input.phone),
    email: emptyToNull(input.email),
  }
  if (input.source === 'gmail_import') row.source = 'gmail_import'
  if ('nudge' in input) row.nudge = nudge.value

  const { data, error } = await db.from('contacts').insert(row).select().single()

  return { data: (data ?? null) as Contact | null, error }
}

export async function updateContact(id: string, input: ContactUpdate, db: Db = supabase, today = localToday()) {
  const invalid = combinedError(contactInputErrors(input, { requireName: false, today }))
  if (invalid) return { data: null, error: invalid }
  if ('nudge' in input) input = { ...input, nudge: normalizeNudge(input.nudge).value }

  const patch: ContactUpdate = { ...input }
  if (input.name != null) patch.name = input.name.trim()
  if ('relationship_type' in input) patch.relationship_type = emptyToNull(input.relationship_type)
  if ('birthday' in input) patch.birthday = emptyToNull(input.birthday)
  if ('notes' in input) patch.notes = emptyToNull(input.notes)
  if ('phone' in input) patch.phone = normalizePhone(input.phone)
  if ('email' in input) patch.email = emptyToNull(input.email)

  const { data, error } = await db.from('contacts').update(patch).eq('id', id).select().single()

  return { data: (data ?? null) as Contact | null, error }
}

export async function snoozeForAWeek(id: string, today: string) {
  return updateContact(id, { snoozed_until: addDays(today, 7) })
}

export async function clearSnooze(id: string) {
  return updateContact(id, { snoozed_until: null })
}

export async function archiveContact(id: string) {
  return updateContact(id, { archived: true })
}

export async function unarchiveContact(id: string) {
  return updateContact(id, { archived: false })
}
