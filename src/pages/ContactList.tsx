import { useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { listContacts, archiveContact, unarchiveContact } from '../lib/contacts'
import type { Contact } from '../types/database'

type ContactListProps = {
  onNew: () => void
  onOpen: (id: string) => void
}

export function ContactList({ onNew, onOpen }: ContactListProps) {
  const [showArchived, setShowArchived] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(archived: boolean) {
    setLoading(true)
    setError(null)
    const { data, error } = await listContacts(archived)
    if (error) {
      setError(error.message)
      setContacts([])
    } else {
      setContacts(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load(showArchived)
  }, [showArchived])

  async function handleArchiveToggle(contact: Contact) {
    const result = contact.archived
      ? await unarchiveContact(contact.id)
      : await archiveContact(contact.id)
    if (result.error) {
      setError(result.error.message)
      return
    }
    await load(showArchived)
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-medium text-[var(--text-h)]">
          {showArchived ? 'Archived contacts' : 'Contacts'}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
            onClick={() => {
              setLoading(true)
              setShowArchived((value) => !value)
            }}
          >
            {showArchived ? 'View active' : 'View archived'}
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white"
            onClick={onNew}
          >
            New contact
          </button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p>Loading contacts…</p> : null}

      {!loading && contacts.length === 0 ? (
        <EmptyState
          title={showArchived ? 'No archived contacts.' : 'No contacts yet.'}
          body={showArchived ? undefined : 'Add someone you want to stay in touch with.'}
        />
      ) : null}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {contacts.map((contact) => (
          <li
            key={contact.id}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-3"
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(contact.id)}>
              <span className="block font-medium text-[var(--text-h)]">{contact.name}</span>
              <span className="block text-sm text-[var(--text)]">
                {contact.relationship_type || 'No relationship type'} · every {contact.cadence_days} days
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              onClick={() => {
                void handleArchiveToggle(contact)
              }}
            >
              {contact.archived ? 'Unarchive' : 'Archive'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
