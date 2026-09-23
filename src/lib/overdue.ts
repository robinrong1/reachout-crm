import { supabase } from './supabase.ts'
import { addDays, diffDays, todayInTimeZone } from '../utils/dates.ts'
import type { Contact, Interaction, OverdueContactRow } from '../types/database.ts'

export type OverdueContact = OverdueContactRow

export type RelationshipState = {
  lastContactDate: string | null
  nextDueDate: string
  daysOverdue: number
  isOverdue: boolean
}

/** Latest real conversation only. No interactions means there is no last-talked date. */
export function lastContactDate(latestOccurredOn: string | null) {
  return latestOccurredOn
}

export function nextDueDate(lastContact: string, cadenceDays: number) {
  return addDays(lastContact, cadenceDays)
}

export function daysOverdue(today: string, nextDue: string) {
  return diffDays(today, nextDue)
}

/** Hidden while today is strictly before snoozed_until. The morning that date arrives, they are back. */
export function isHiddenBySnooze(today: string, snoozedUntil: string | null | undefined) {
  if (!snoozedUntil) return false
  return today < snoozedUntil
}

/**
 * Overdue rule: last talk is the latest interactions.occurred_on, or null.
 * No conversations → due now (days_overdue = 0). Otherwise overdue when
 * today >= last_contact_date + cadence_days. `today` is the user-local date.
 */
export function computeRelationshipState(input: {
  today: string
  cadenceDays: number
  latestOccurredOn: string | null
}): RelationshipState {
  const last = lastContactDate(input.latestOccurredOn)
  if (!last) {
    return {
      lastContactDate: null,
      nextDueDate: input.today,
      daysOverdue: 0,
      isOverdue: true,
    }
  }

  const nextDue = nextDueDate(last, input.cadenceDays)
  const overdueBy = daysOverdue(input.today, nextDue)

  return {
    lastContactDate: last,
    nextDueDate: nextDue,
    daysOverdue: overdueBy,
    isOverdue: overdueBy >= 0,
  }
}

export function relationshipStateForContact(
  contact: Contact,
  interactions: Interaction[],
  timeZone: string,
  now = new Date(),
) {
  const latestOccurredOn =
    interactions.length === 0
      ? null
      : interactions.reduce((latest, item) => (item.occurred_on > latest ? item.occurred_on : latest), interactions[0].occurred_on)

  return computeRelationshipState({
    today: todayInTimeZone(timeZone, now),
    cadenceDays: contact.cadence_days,
    latestOccurredOn,
  })
}

export async function listOverdueContacts(db: typeof supabase = supabase) {
  const { data, error } = await db
    .from('overdue_contacts')
    .select('*')
    .order('days_overdue', { ascending: false })

  return { data: (data ?? null) as OverdueContact[] | null, error }
}
