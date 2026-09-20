import { useEffect, useState } from 'react'
import { ContactForm } from '../components/ContactForm'
import { InteractionForm } from '../components/InteractionForm'
import { archiveContact, getContact, unarchiveContact, updateContact } from '../lib/contacts'
import {
  createInteraction,
  deleteInteraction,
  listInteractions,
  localToday,
  updateInteraction,
} from '../lib/interactions'
import { relationshipStateForContact } from '../lib/overdue'
import { getUserTimezone } from '../lib/users'
import { formatDisplayDate } from '../utils/dates'
import type { Contact, Interaction } from '../types/database'

type ContactDetailProps = {
  id: string
  onBack: () => void
}

export function ContactDetail({ id, onBack }: ContactDetailProps) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [timeZone, setTimeZone] = useState('UTC')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reachingOut, setReachingOut] = useState(false)

  async function loadInteractions() {
    const { data, error } = await listInteractions(id)
    if (error) {
      setError(error.message)
      setInteractions([])
      return
    }
    setInteractions(data ?? [])
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([getContact(id), listInteractions(id), getUserTimezone()]).then(
      ([contactResult, interactionResult, timezoneResult]) => {
        if (cancelled) return

        if (contactResult.error) {
          setError(contactResult.error.message)
          setContact(null)
        } else {
          setContact(contactResult.data)
        }

        if (interactionResult.error) {
          setError(interactionResult.error.message)
          setInteractions([])
        } else {
          setInteractions(interactionResult.data ?? [])
        }

        if (timezoneResult.error) {
          setError(timezoneResult.error.message)
        } else {
          setTimeZone(timezoneResult.timezone)
        }

        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return <p>Loading contact…</p>
  }

  if (!contact) {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-sm text-red-600" role="alert">
          {error ?? 'Contact not found.'}
        </p>
        <button
          type="button"
          className="w-fit rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          onClick={onBack}
        >
          Back
        </button>
      </section>
    )
  }

  const editing = interactions.find((item) => item.id === editingId)
  const status = relationshipStateForContact(contact, interactions, timeZone)

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-medium text-[var(--text-h)]">{contact.name}</h2>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          onClick={onBack}
        >
          Back
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-lg font-medium text-[var(--text-h)]">Profile</h3>
        {editingProfile ? (
          <>
            <ContactForm
              key={contact.id}
              initial={contact}
              submitLabel="Save changes"
              onSubmit={async (input) => {
                const { data, error } = await updateContact(contact.id, input)
                if (error) throw error
                if (data) setContact(data)
                setEditingProfile(false)
              }}
            />
            <button
              type="button"
              className="w-fit rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
              onClick={() => setEditingProfile(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <dl className="m-0 grid gap-2 text-sm">
              <div>
                <dt className="text-[var(--text)]">Relationship</dt>
                <dd className="m-0 text-[var(--text-h)]">{contact.relationship_type || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--text)]">Cadence</dt>
                <dd className="m-0 text-[var(--text-h)]">every {contact.cadence_days} days</dd>
              </div>
              <div>
                <dt className="text-[var(--text)]">Birthday</dt>
                <dd className="m-0 text-[var(--text-h)]">
                  {contact.birthday ? formatDisplayDate(contact.birthday) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text)]">Notes</dt>
                <dd className="m-0 whitespace-pre-wrap text-[var(--text-h)]">{contact.notes || '—'}</dd>
              </div>
              {contact.archived ? (
                <p className="m-0 text-sm text-[var(--text)]">This contact is archived.</p>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={() => setEditingProfile(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
                onClick={async () => {
                  const result = contact.archived
                    ? await unarchiveContact(contact.id)
                    : await archiveContact(contact.id)
                  if (result.error) {
                    setError(result.error.message)
                    return
                  }
                  onBack()
                }}
              >
                {contact.archived ? 'Unarchive' : 'Archive'}
              </button>
              {status.isOverdue && !contact.archived ? (
                <button
                  type="button"
                  disabled={reachingOut}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
                  onClick={async () => {
                    setReachingOut(true)
                    setError(null)
                    const { error } = await createInteraction({
                      contact_id: contact.id,
                      occurred_on: localToday(),
                    })
                    setReachingOut(false)
                    if (error) {
                      setError(error.message)
                      return
                    }
                    await loadInteractions()
                  }}
                >
                  {reachingOut ? 'Saving…' : 'Reached out today'}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="rounded-md border border-[var(--border)] px-3 py-3 text-sm">
        <h3 className="m-0 mb-2 text-base font-medium text-[var(--text-h)]">Relationship status</h3>
        <p>Last contact: {formatDisplayDate(status.lastContactDate)}</p>
        <p>Next due: {formatDisplayDate(status.nextDueDate)}</p>
        <p>
          {status.isOverdue
            ? status.daysOverdue === 0
              ? 'Due today'
              : `Overdue by ${status.daysOverdue} day${status.daysOverdue === 1 ? '' : 's'}`
            : `Not overdue (${Math.abs(status.daysOverdue)} day${Math.abs(status.daysOverdue) === 1 ? '' : 's'} until due)`}
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6">
        <h3 className="m-0 text-lg font-medium text-[var(--text-h)]">Interaction history</h3>
        <p className="text-sm text-[var(--text)]">Newest first. Date is required; a note is optional.</p>

        {editing ? (
          <InteractionForm
            key={editing.id}
            initial={editing}
            submitLabel="Save interaction"
            onCancel={() => setEditingId(null)}
            onSubmit={async (input) => {
              const { error } = await updateInteraction(editing.id, input)
              if (error) throw error
              setEditingId(null)
              await loadInteractions()
            }}
          />
        ) : (
          <InteractionForm
            submitLabel="Log interaction"
            onSubmit={async (input) => {
              const { error } = await createInteraction({
                contact_id: contact.id,
                occurred_on: input.occurred_on,
                note: input.note,
              })
              if (error) throw error
              await loadInteractions()
            }}
          />
        )}

        {interactions.length === 0 ? (
          <p className="text-[var(--text)]">No interactions yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {interactions.map((interaction) => (
              <li key={interaction.id} className="border-b border-[var(--border)] pb-3">
                <p className="font-medium text-[var(--text-h)]">{formatDisplayDate(interaction.occurred_on)}</p>
                {interaction.note ? (
                  <p className="mt-1 text-[var(--text)]">{interaction.note}</p>
                ) : (
                  <p className="mt-1 text-sm text-[var(--text)]">No note</p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-sm"
                    onClick={() => setEditingId(interaction.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1 text-sm"
                    onClick={async () => {
                      const { error } = await deleteInteraction(interaction.id)
                      if (error) {
                        setError(error.message)
                        return
                      }
                      if (editingId === interaction.id) setEditingId(null)
                      await loadInteractions()
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
