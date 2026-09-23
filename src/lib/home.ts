import type { ContactListItem } from './contacts'
import { daysUntilBirthday, nextBirthdayOn } from './birthdays'
import { computeRelationshipState, isHiddenBySnooze, type OverdueContact } from './overdue'

/** Today plus the next 6 days — a 7-day glance, not a dedicated birthdays page. */
export const HOME_LOOKAHEAD_DAYS = 7

export type CatchUpItem = {
  id: string
  name: string
  kind: 'overdue' | 'due_soon'
  daysOverdue: number
  nudge: string | null
}

export type UpcomingBirthday = {
  id: string
  name: string
  nextOn: string
  daysUntil: number
}

export type HomeSection = {
  label: 'TODAY' | 'THIS WEEK'
  catchUp: CatchUpItem[]
  birthdays: UpcomingBirthday[]
}

/** Overdue from the existing view, plus people whose next due date falls in the 7-day window. */
export function buildCatchUp(
  overdue: OverdueContact[],
  contacts: ContactListItem[],
  today: string,
): CatchUpItem[] {
  const overdueItems: CatchUpItem[] = [...overdue]
    .filter((contact) => !isHiddenBySnooze(today, contact.snoozed_until))
    .sort((a, b) => b.days_overdue - a.days_overdue)
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      kind: 'overdue',
      daysOverdue: contact.days_overdue,
      nudge: contact.nudge?.trim() || null,
    }))

  const overdueIds = new Set(overdueItems.map((item) => item.id))
  const dueSoon: CatchUpItem[] = []

  for (const contact of contacts) {
    if (contact.archived || overdueIds.has(contact.id)) continue
    if (isHiddenBySnooze(today, contact.snoozed_until)) continue

    const state = computeRelationshipState({
      today,
      cadenceDays: contact.cadence_days,
      latestOccurredOn: contact.last_occurred_on,
    })

    if (state.isOverdue) continue
    if (state.daysOverdue < -(HOME_LOOKAHEAD_DAYS - 1)) continue

    dueSoon.push({
      id: contact.id,
      name: contact.name,
      kind: 'due_soon',
      daysOverdue: state.daysOverdue,
      nudge: contact.nudge?.trim() || null,
    })
  }

  dueSoon.sort((a, b) => b.daysOverdue - a.daysOverdue || a.name.localeCompare(b.name))
  return [...overdueItems, ...dueSoon]
}

export function buildUpcomingBirthdays(contacts: ContactListItem[], today: string): UpcomingBirthday[] {
  const items: UpcomingBirthday[] = []

  for (const contact of contacts) {
    if (contact.archived || !contact.birthday) continue
    const daysUntil = daysUntilBirthday(contact.birthday, today)
    if (daysUntil < 0 || daysUntil >= HOME_LOOKAHEAD_DAYS) continue
    items.push({
      id: contact.id,
      name: contact.name,
      nextOn: nextBirthdayOn(contact.birthday, today),
      daysUntil,
    })
  }

  items.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
  return items
}

/** Headline and whether Home should link to the Catch up list. Due-soon people are not a catch-up yet. */
export function catchUpCardCopy(people: CatchUpItem[]) {
  const overdue = people.filter((person) => person.kind === 'overdue').length
  const dueSoon = people.length - overdue
  const names = joinNames(people.map((person) => person.name))

  if (overdue === 0) {
    const verb = people.length === 1 ? 'is' : 'are'
    return {
      title: `${names} ${verb} due soon.`,
      body: 'Say hello when you have a minute.',
      linkToCatchUp: false,
    }
  }

  const parts = [overdue === 1 ? '1 person is overdue' : `${overdue} people are overdue`]
  if (dueSoon > 0) {
    parts.push(dueSoon === 1 ? '1 is due soon' : `${dueSoon} are due soon`)
  }

  return {
    title: `Catch up with ${names}.`,
    body: `${parts.join(' · ')}. The full list is on Catch up.`,
    linkToCatchUp: true,
  }
}

export function joinNames(names: string[], named = 2) {
  if (names.length === 0) return 'someone'
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  const shown = names.slice(0, named)
  const rest = names.length - named
  if (rest <= 0) {
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
  }
  return `${shown.join(', ')}, and ${rest} ${rest === 1 ? 'other' : 'others'}`
}

/** Birthdays today sit under TODAY; catch-up and later birthdays sit under THIS WEEK. */
export function groupHomeFeed(catchUp: CatchUpItem[], birthdays: UpcomingBirthday[]): HomeSection[] {
  const todayBirthdays = birthdays.filter((item) => item.daysUntil === 0)
  const laterBirthdays = birthdays.filter((item) => item.daysUntil > 0)
  const sections: HomeSection[] = []

  if (todayBirthdays.length > 0) {
    sections.push({ label: 'TODAY', catchUp: [], birthdays: todayBirthdays })
  }
  if (catchUp.length > 0 || laterBirthdays.length > 0) {
    sections.push({ label: 'THIS WEEK', catchUp, birthdays: laterBirthdays })
  }

  return sections
}
