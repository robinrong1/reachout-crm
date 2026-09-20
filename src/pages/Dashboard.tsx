import { useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { OverdueList } from '../components/OverdueList'
import { createInteraction, localToday } from '../lib/interactions'
import { listOverdueContacts, type OverdueContact } from '../lib/overdue'

type DashboardProps = {
  onViewContact: (id: string) => void
}

export function Dashboard({ onViewContact }: DashboardProps) {
  const [contacts, setContacts] = useState<OverdueContact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reachingOutId, setReachingOutId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error } = await listOverdueContacts()
    if (error) {
      setError(error.message)
      setContacts([])
    } else {
      setContacts(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleReachedOut(contactId: string) {
    setReachingOutId(contactId)
    setError(null)
    const { error } = await createInteraction({
      contact_id: contactId,
      occurred_on: localToday(),
    })
    setReachingOutId(null)
    if (error) {
      setError(error.message)
      return
    }
    await load()
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="m-0 text-xl font-medium text-[var(--text-h)]">Overdue</h2>
      <p className="m-0 text-sm text-[var(--text)]">
        People you care about that you haven&apos;t talked to within their cadence.
      </p>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p>Loading overdue contacts…</p> : null}

      {!loading && contacts.length === 0 && !error ? (
        <EmptyState title="You're caught up." body="No one is overdue right now. Check Contacts to add people or log a past interaction." />
      ) : null}

      {!loading && contacts.length > 0 ? (
        <OverdueList
          contacts={contacts}
          reachingOutId={reachingOutId}
          onReachedOut={(id) => {
            void handleReachedOut(id)
          }}
          onView={onViewContact}
        />
      ) : null}
    </section>
  )
}
