import { supabase } from './supabase'
import { addDays, calendarDateInTimeZone, diffDays, todayInTimeZone } from '../utils/dates'
import type { Contact, Interaction, OverdueContactRow } from '../types/database'

export type OverdueContact = OverdueContactRow

export type RelationshipState = {
  lastContactDate: string
  nextDueDate: string
  daysOverdue: number
  isOverdue: boolean
}

export function lastContactDate(latestOccurredOn: string | null, createdAtLocalDate: string) {
  return latestOccurredOn ?? createdAtLocalDate
}

export function nextDueDate(lastContact: string, cadenceDays: number) {
  return addDays(lastContact, cadenceDays)
}

export function daysOverdue(today: string, nextDue: string) {
  return diffDays(today, nextDue)
}

/**
 * Pure overdue rule from Section 7. Used by tests and by the UI for a
 * single contact. The overdue_contacts view is the same rule in SQL.
 */
export function computeRelationshipState(input: {
  today: string
  cadenceDays: number
  latestOccurredOn: string | null
  createdAt: string
  timeZone: string
}): RelationshipState {
  const createdAtLocalDate = calendarDateInTimeZone(new Date(input.createdAt), input.timeZone)
  const last = lastContactDate(input.latestOccurredOn, createdAtLocalDate)
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
    createdAt: contact.created_at,
    timeZone,
  })
}

export async function listOverdueContacts() {
  const { data, error } = await supabase
    .from('overdue_contacts')
    .select('*')
    .order('days_overdue', { ascending: false })

  return { data: (data ?? null) as OverdueContact[] | null, error }
}
