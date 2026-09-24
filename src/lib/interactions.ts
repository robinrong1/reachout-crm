import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'
import type { Database, Interaction, InteractionInsert, InteractionUpdate } from '../types/database.ts'
import { attachContactNames, type TimelineItem } from './timeline.ts'
import { isRealIsoDate } from './contactFields.ts'
import { localToday } from '../utils/dates.ts'

export { localToday }

type Db = SupabaseClient<Database>

function emptyToNull(value: string | null | undefined) {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** A future conversation would push next_due_date out and hide the person from overdue. */
export function validateOccurredOn(occurredOn: string, today: string) {
  if (!isRealIsoDate(occurredOn)) return new Error('Date must be a real date as YYYY-MM-DD')
  if (occurredOn > today) return new Error('Date cannot be in the future')
  return null
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

/** `today` is the user's local date; the MCP server passes it from the user's timezone. */
export async function createInteraction(input: InteractionInsert, db: Db = supabase, today = localToday()) {
  const occurredOn = input.occurred_on?.trim() || today
  const dateError = validateOccurredOn(occurredOn, today)
  if (dateError) return { data: null, error: dateError }

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
    const dateError = validateOccurredOn(occurredOn, localToday())
    if (dateError) return { data: null, error: dateError }
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
