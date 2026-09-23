import { validateCadenceDays } from './cadence.ts'
import { cadenceForCurrentMembers } from './groupHeadings.ts'
import { supabase } from './supabase.ts'
import type { ContactGroup, Group } from '../types/database.ts'

export const GROUP_NAME_MAX = 40

export function isMissingGroupsSchema(error: { message: string; code?: string } | null) {
  if (!error) return false
  const message = error.message.toLowerCase()
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes('schema cache') ||
    (message.includes('does not exist') && message.includes('group'))
  )
}

export const GROUPS_SCHEMA_MISSING = new Error(
  'Groups are not set up on this database yet. Apply schema.sql in the Supabase SQL editor, then reload.',
)

function writeError(error: { message: string; code?: string } | null) {
  if (isMissingGroupsSchema(error)) return GROUPS_SCHEMA_MISSING
  return error
}

export function validateGroupName(name: string | undefined) {
  if (name == null) return new Error('Give this group a name')
  const trimmed = name.trim()
  if (trimmed.length === 0) return new Error('Give this group a name')
  if (trimmed.length > GROUP_NAME_MAX) {
    return new Error(`Group names must be ${GROUP_NAME_MAX} characters or fewer`)
  }
  return null
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) return { userId: null, error }
  if (!data.user) return { userId: null, error: new Error('Not signed in') }
  return { userId: data.user.id, error: null }
}

export async function listGroups() {
  const { data, error } = await supabase.from('groups').select('*').order('name', { ascending: true })
  if (isMissingGroupsSchema(error)) return { data: [] as Group[], error: null }
  return { data: (data ?? null) as Group[] | null, error }
}

export async function createGroup(name: string) {
  const nameError = validateGroupName(name)
  if (nameError) return { data: null as Group | null, error: nameError }

  const { userId, error: userError } = await requireUserId()
  if (userError || !userId) return { data: null as Group | null, error: userError }

  const { data, error } = await supabase
    .from('groups')
    .insert({ user_id: userId, name: name.trim() })
    .select()
    .single()

  return { data: (data ?? null) as Group | null, error: writeError(error) }
}

export async function renameGroup(id: string, name: string) {
  const nameError = validateGroupName(name)
  if (nameError) return { data: null as Group | null, error: nameError }

  const { data, error } = await supabase
    .from('groups')
    .update({ name: name.trim() })
    .eq('id', id)
    .select()
    .single()

  return { data: (data ?? null) as Group | null, error: writeError(error) }
}

export async function deleteGroup(id: string) {
  const { error } = await supabase.from('groups').delete().eq('id', id)
  return { error: writeError(error) }
}

export async function listContactGroups(contactIds: string[]) {
  if (contactIds.length === 0) return { data: [] as ContactGroup[], error: null }

  const { data, error } = await supabase
    .from('contact_groups')
    .select('contact_id, group_id')
    .in('contact_id', contactIds)

  if (isMissingGroupsSchema(error)) return { data: [] as ContactGroup[], error: null }
  return { data: (data ?? []) as ContactGroup[], error }
}

export async function addContactToGroup(contactId: string, groupId: string) {
  const { error } = await supabase.from('contact_groups').insert({ contact_id: contactId, group_id: groupId })
  return { error: writeError(error) }
}

export async function removeContactFromGroup(contactId: string, groupId: string) {
  const { error } = await supabase
    .from('contact_groups')
    .delete()
    .eq('contact_id', contactId)
    .eq('group_id', groupId)
  return { error: writeError(error) }
}

/**
 * Writes cadence_days onto people in the group at this moment.
 * Membership changes later do not repeat it. Groups have no cadence of their own.
 */
export async function setGroupCadence(groupId: string, cadenceDays: number) {
  const cadenceError = validateCadenceDays(cadenceDays)
  if (cadenceError) return { error: cadenceError, updated: 0 }

  const { data, error } = await supabase.from('contact_groups').select('contact_id').eq('group_id', groupId)
  if (error) return { error: writeError(error), updated: 0 }

  const writes = cadenceForCurrentMembers(
    (data ?? []).map((row) => ({ contactId: row.contact_id, groupId })),
    groupId,
    cadenceDays,
  )
  if (writes.length === 0) return { error: null, updated: 0 }

  const { error: updateError } = await supabase
    .from('contacts')
    .update({ cadence_days: cadenceDays })
    .in(
      'id',
      writes.map((row) => row.contactId),
    )

  return { error: writeError(updateError), updated: updateError ? 0 : writes.length }
}
