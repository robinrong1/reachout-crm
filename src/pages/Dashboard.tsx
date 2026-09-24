import { useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { OverdueList } from '../components/OverdueList'
import { snoozeForAWeek } from '../lib/contacts'
import { primaryGroupName } from '../lib/groupHeadings'
import { listContactGroups, listGroups } from '../lib/groups'
import { reachedOutToday } from '../lib/interactions'
import { listOverdueContacts, type OverdueContact } from '../lib/overdue'
import { useDataVersion } from '../lib/useDataVersion'
import { getUserTimezone } from '../lib/users'
import { todayInTimeZone } from '../utils/dates'
import type { ContactGroup, Group } from '../types/database'

type DashboardProps = {
  onViewContact: (id: string) => void
}

async function loadCatchUp() {
  const [overdueResult, timezoneResult, groupResult] = await Promise.all([
    listOverdueContacts(),
    getUserTimezone(),
    listGroups(),
  ])
  const ids = (overdueResult.data ?? []).map((contact) => contact.id)
  const memberResult = await listContactGroups(ids)
  return { overdueResult, timezoneResult, groupResult, memberResult }
}

export function Dashboard({ onViewContact }: DashboardProps) {
  const [contacts, setContacts] = useState<OverdueContact[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [memberships, setMemberships] = useState<ContactGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reachingOutId, setReachingOutId] = useState<string | null>(null)
  const [today, setToday] = useState<string | null>(null)
  const dataVersion = useDataVersion()

  function applyCatchUp(result: Awaited<ReturnType<typeof loadCatchUp>>) {
    setToday(todayInTimeZone(result.timezoneResult.timezone || 'UTC'))
    if (result.overdueResult.error) {
      setError(result.overdueResult.error.message)
      setContacts([])
    } else {
      setContacts(result.overdueResult.data ?? [])
    }
    if (result.groupResult.error) {
      setError(result.groupResult.error.message)
      setGroups([])
    } else {
      setGroups(result.groupResult.data ?? [])
    }
    if (result.memberResult.error) {
      setError(result.memberResult.error.message)
      setMemberships([])
    } else {
      setMemberships(result.memberResult.data ?? [])
    }
    if (!result.overdueResult.error && !result.groupResult.error && !result.memberResult.error) {
      setError(null)
    }
    setLoading(false)
  }

  async function load() {
    applyCatchUp(await loadCatchUp())
  }

  useEffect(() => {
    let cancelled = false
    void loadCatchUp().then((result) => {
      if (cancelled) return
      applyCatchUp(result)
    })
    return () => {
      cancelled = true
    }
  }, [dataVersion])

  async function handleSnooze(contactId: string) {
    if (!today) return
    setReachingOutId(contactId)
    setError(null)
    const { error } = await snoozeForAWeek(contactId, today)
    setReachingOutId(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  async function handleReachedOut(contactId: string, note: string | null) {
    setReachingOutId(contactId)
    setError(null)
    const { error } = await reachedOutToday(contactId, note)
    setReachingOutId(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  const kicker = loading
    ? 'This week'
    : error
      ? 'Could not load people'
      : contacts.length === 1
        ? '1 person to reach'
        : `${contacts.length} people to reach`

  return (
    <section className="page-shell feed-shell" aria-labelledby="catch-up-heading" aria-busy={loading}>
      <header className="masthead">
        <p className="masthead-eyebrow">{kicker}</p>
        <h2 id="catch-up-heading" className="masthead-title">
          Catch up
        </h2>
      </header>

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setLoading(true)
            setError(null)
            void load()
          }}
        />
      ) : null}

      {loading ? <p role="status">Loading…</p> : null}

      {!loading && contacts.length === 0 && !error ? (
        <EmptyState
          title="You're caught up."
          body="Nobody is waiting on a hello. Add people, or log a conversation from Contacts."
        />
      ) : null}

      {!loading && contacts.length > 0 ? (
        <OverdueList
          contacts={contacts}
          reachingOutId={reachingOutId}
          groupNameFor={(id) =>
            primaryGroupName(
              memberships.filter((row) => row.contact_id === id).map((row) => row.group_id),
              groups,
            )
          }
          onReachedOut={(id, note) => {
            void handleReachedOut(id, note)
          }}
          onSnooze={(id) => {
            void handleSnooze(id)
          }}
          onView={onViewContact}
        />
      ) : null}
    </section>
  )
}
