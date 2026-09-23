import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'
import type { Database, Interaction, InteractionInsert, InteractionUpdate } from '../types/database.ts'
import { attachContactNames, type TimelineItem } from './timeline.ts'

type Db = SupabaseClient<Database>

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Local calendar date as YYYY-MM-DD. Avoid toISOString(); that is UTC. */
export function localToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function listInteractions(contactId: string, db: Db = supabase) {
  const { data, error } = await db
    .from('interactions')
    .select('*')
    .eq('contact_id', contactId)
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  return { data: (data ?? null) as Interaction[] | null, error }
}

export async function listTimeline() {
  const { data, error } = await supabase
    .from('interactions')
    .select('*')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return { data: null as TimelineItem[] | null, error }

  const interactions = (data ?? []) as Interaction[]
  if (interactions.length === 0) return { data: [] as TimelineItem[], error: null }

  const contactIds = [...new Set(interactions.map((row) => row.contact_id))]
  const { data: contacts, error: contactError } = await supabase
    .from('contacts')
    .select('id, name, archived')
    .in('id', contactIds)

  if (contactError) return { data: null as TimelineItem[] | null, error: contactError }

  return {
    data: attachContactNames(
      interactions,
      (contacts ?? []).map((contact) => ({
        id: contact.id,
        name: contact.name,
        archived: contact.archived,
      })),
    ),
    error: null,
  }
}

/** One reach-out for today, shared by Home, Keep in touch, and the person page. */
export async function reachedOutToday(contactId: string, note?: string | null) {
  return createInteraction({
    contact_id: contactId,
    occurred_on: localToday(),
    note,
  })
}

export async function createInteraction(input: InteractionInsert, db: Db = supabase) {
  const occurredOn = input.occurred_on?.trim() || localToday()
  if (!isIsoDate(occurredOn)) {
    return { data: null, error: new Error('Interaction date must be YYYY-MM-DD') }
  }

  const { data, error } = await db
    .from('interactions')
    .insert({
      contact_id: input.contact_id,
      occurred_on: occurredOn,
      note: emptyToNull(input.note),
    })
    .select()
    .single()

  return { data: (data ?? null) as Interaction | null, error }
}

export async function updateInteraction(id: string, input: InteractionUpdate) {
  const patch: InteractionUpdate = {}

  if (input.occurred_on != null) {
    const occurredOn = input.occurred_on.trim()
    if (!isIsoDate(occurredOn)) {
      return { data: null, error: new Error('Interaction date must be YYYY-MM-DD') }
    }
    patch.occurred_on = occurredOn
  }

  if ('note' in input) {
    patch.note = emptyToNull(input.note)
  }

  const { data, error } = await supabase
    .from('interactions')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  return { data: (data ?? null) as Interaction | null, error }
}

export async function deleteInteraction(id: string) {
  const { error } = await supabase.from('interactions').delete().eq('id', id)
  return { error }
}
