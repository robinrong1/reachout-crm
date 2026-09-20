import { supabase } from './supabase'
import type { Contact, ContactInsert, ContactUpdate } from '../types/database'

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function validateCadence(cadenceDays: number | undefined) {
  if (cadenceDays == null) return null
  if (!Number.isInteger(cadenceDays) || cadenceDays <= 0) {
    return new Error('Cadence must be a whole number of days greater than 0')
  }
  return null
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) return { userId: null, error }
  if (!data.user) return { userId: null, error: new Error('Not signed in') }
  return { userId: data.user.id, error: null }
}

export async function listContacts(archived: boolean) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('archived', archived)
    .order('name', { ascending: true })

  return { data: (data ?? null) as Contact[] | null, error }
}

export async function getContact(id: string) {
  const { data, error } = await supabase.from('contacts').select('*').eq('id', id).maybeSingle()

  return { data: (data ?? null) as Contact | null, error }
}

export async function createContact(input: ContactInsert) {
  const cadenceError = validateCadence(input.cadence_days)
  if (cadenceError) return { data: null, error: cadenceError }

  const { userId, error: userError } = await requireUserId()
  if (userError || !userId) return { data: null, error: userError }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      relationship_type: emptyToNull(input.relationship_type),
      cadence_days: input.cadence_days ?? 30,
      birthday: emptyToNull(input.birthday),
      notes: emptyToNull(input.notes),
    })
    .select()
    .single()

  return { data: (data ?? null) as Contact | null, error }
}

export async function updateContact(id: string, input: ContactUpdate) {
  const cadenceError = validateCadence(input.cadence_days)
  if (cadenceError) return { data: null, error: cadenceError }

  const patch: ContactUpdate = { ...input }
  if (input.name != null) patch.name = input.name.trim()
  if ('relationship_type' in input) patch.relationship_type = emptyToNull(input.relationship_type)
  if ('birthday' in input) patch.birthday = emptyToNull(input.birthday)
  if ('notes' in input) patch.notes = emptyToNull(input.notes)

  const { data, error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  return { data: (data ?? null) as Contact | null, error }
}

export async function archiveContact(id: string) {
  return updateContact(id, { archived: true })
}

export async function unarchiveContact(id: string) {
  return updateContact(id, { archived: false })
}
