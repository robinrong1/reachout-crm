import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { ContactForm } from '../components/ContactForm'
import { ErrorBanner } from '../components/ErrorBanner'
import { InteractionForm } from '../components/InteractionForm'
import { ReachLinks, ReachedOutButton } from '../components/ReachActions'
import { archiveContact, clearSnooze, getContact, unarchiveContact, updateContact } from '../lib/contacts'
import {
  createInteraction,
  deleteInteraction,
  listInteractions,
  reachedOutToday,
  updateInteraction,
} from '../lib/interactions'
import { formatCadence } from '../lib/cadence'
import { timelineEventLabel, timelineNoteBody } from '../lib/timeline'
import { isHiddenBySnooze, relationshipStateForContact } from '../lib/overdue'
import { useDataVersion } from '../lib/useDataVersion'
import { getUserTimezone } from '../lib/users'
import { formatDisplayDate, todayInTimeZone } from '../utils/dates'
import type { Contact, Group, Interaction } from '../types/database'
import {
  addContactToGroup,
  listContactGroups,
  listGroups,
  removeContactFromGroup,
} from '../lib/groups'

export function ContactDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const backTo = (location.state as { from?: string } | null)?.from ?? '/contacts'
  const onBack = () => navigate(backTo)
  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [timeZone, setTimeZone] = useState('UTC')
  const [editingProfile, setEditingProfile] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reachingOut, setReachingOut] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [groupIds, setGroupIds] = useState<string[]>([])
  const dataVersion = useDataVersion()

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

    Promise.all([getContact(id), listInteractions(id), getUserTimezone(), listGroups(), listContactGroups([id])]).then(
      ([contactResult, interactionResult, timezoneResult, groupsResult, membershipResult]) => {
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

        if (groupsResult.error) {
          setError(groupsResult.error.message)
        } else {
          setGroups(groupsResult.data ?? [])
        }

        if (membershipResult.error) {
          setError(membershipResult.error.message)
        } else {
          setGroupIds((membershipResult.data ?? []).map((row) => row.group_id))
        }

        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [id, dataVersion])

  if (loading) {
    return (
      <p role="status" aria-busy="true">
        Loading…
      </p>
    )
  }

  if (!contact) {
    return (
      <section className="flex flex-col gap-4">
        <ErrorBanner message={error ?? 'That person was not found.'} />
        <button type="button" className="text-link self-start" onClick={onBack}>
          Back
        </button>
      </section>
    )
  }

  const editing = interactions.find((item) => item.id === editingId)
  const status = relationshipStateForContact(contact, interactions, timeZone)
  const pausedUntil = contact.snoozed_until
  const paused = isHiddenBySnooze(todayInTimeZone(timeZone), pausedUntil)
  const contactId = contact.id

  async function resume() {
    const { data, error: clearError } = await clearSnooze(contactId)
    if (clearError) {
      setError(clearError.message)
      return
    }
    if (data) setContact(data)
  }

  return (
    <section className="page-shell feed-shell" aria-labelledby="person-heading">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={contact.name} size="lg" />
          <div className="masthead">
            <p className="masthead-eyebrow">
              {contact.relationship_type || 'Someone you care about'}
              {contact.archived ? ' · archived' : ''}
            </p>
            <h2 id="person-heading" className="masthead-title">
              {contact.name}
            </h2>
          </div>
        </div>
        <button type="button" className="text-link self-start" onClick={onBack}>
          Back
        </button>
      </header>

      {error ? <ErrorBanner message={error} /> : null}

      {paused && pausedUntil ? (
        <p className="m-0 text-sm text-[var(--text)]">
          Paused until {formatDisplayDate(pausedUntil)}.{' '}
          <button type="button" className="text-link" onClick={() => void resume()}>
            Clear
          </button>
        </p>
      ) : null}

      <div className="person-meta">
        <p>
          Last talked
          <strong>{status.lastContactDate ? formatDisplayDate(status.lastContactDate) : 'Never'}</strong>
        </p>
        <p>
          Next check-in
          <strong>{formatDisplayDate(status.nextDueDate)}</strong>
        </p>
        <p>
          Status
          <strong>
            {status.isOverdue
              ? status.daysOverdue === 0
                ? 'Due today'
                : `${status.daysOverdue} day${status.daysOverdue === 1 ? '' : 's'} overdue`
              : `${Math.abs(status.daysOverdue)} day${Math.abs(status.daysOverdue) === 1 ? '' : 's'} until due`}
          </strong>
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="home-section-label">About them</h3>
        {editingProfile ? (
          <>
            <ContactForm
              key={contact.id}
              initial={contact}
              submitLabel="Save"
              onSubmit={async (input) => {
                const { data, error } = await updateContact(contact.id, input)
                if (error) throw error
                if (data) setContact(data)
                setEditingProfile(false)
              }}
            />
            <button type="button" className="text-link self-start" onClick={() => setEditingProfile(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <dl className="m-0 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--text)]">Stay in touch</dt>
                <dd className="m-0 text-[var(--text-h)]">{formatCadence(contact.cadence_days)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text)]">Phone</dt>
                <dd className="m-0 text-[var(--text-h)]">{contact.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--text)]">Email</dt>
                <dd className="m-0 text-[var(--text-h)]">{contact.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--text)]">Birthday</dt>
                <dd className="m-0 text-[var(--text-h)]">
                  {contact.birthday ? formatDisplayDate(contact.birthday) : '—'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--text)]">Nudge</dt>
                <dd className="m-0 text-[var(--text-h)]">{contact.nudge || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--text)]">Notes</dt>
                <dd className="m-0 whitespace-pre-wrap text-[var(--text-h)]">{contact.notes || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--text)]">Groups</dt>
                <dd className="m-0 mt-2 flex flex-col gap-2">
                  {groups.length === 0 ? (
                    <span className="text-[var(--text)]">Create groups from Contacts if you want to sort people.</span>
                  ) : (
                    groups.map((group) => (
                      <label key={group.id} className="flex items-center gap-2 text-[var(--text-h)]">
                        <input
                          type="checkbox"
                          checked={groupIds.includes(group.id)}
                          onChange={async () => {
                            const belongs = groupIds.includes(group.id)
                            const result = belongs
                              ? await removeContactFromGroup(contact.id, group.id)
                              : await addContactToGroup(contact.id, group.id)
                            if (result.error) {
                              setError(result.error.message)
                              return
                            }
                            setGroupIds((current) =>
                              belongs ? current.filter((id) => id !== group.id) : [...current, group.id],
                            )
                          }}
                        />
                        {group.name}
                      </label>
                    ))
                  )}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="text-link" onClick={() => setEditingProfile(true)}>
                Edit
              </button>
              <button
                type="button"
                className="text-link"
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
              <ReachLinks phone={contact.phone} email={contact.email} />
              {status.isOverdue && !contact.archived ? (
                <ReachedOutButton
                  label="I reached out"
                  busy={reachingOut}
                  ariaLabel={`Mark that you reached out to ${contact.name} today`}
                  onCommit={(note) => {
                    void (async () => {
                      setReachingOut(true)
                      setError(null)
                      const { error } = await reachedOutToday(contact.id, note)
                      setReachingOut(false)
                      if (error) {
                        setError(error.message)
                        return
                      }
                      await loadInteractions()
                    })()
                  }}
                />
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="home-section-label">Conversations</h3>
          <p className="page-kicker">Newest first. A date is enough; a note is optional.</p>
        </div>

        {editing ? (
          <InteractionForm
            key={editing.id}
            initial={editing}
            submitLabel="Save"
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
            submitLabel="Log a conversation"
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
          <p className="text-[var(--text)]" role="status">
            No conversations yet.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {interactions.map((interaction) => (
              <li key={interaction.id} className="conversation-note">
                <p className="home-card-time">{formatDisplayDate(interaction.occurred_on)}</p>
                <p className="timeline-event-label mt-1">{timelineEventLabel(interaction.note)}</p>
                {timelineNoteBody(interaction.note) ? (
                  <p className="timeline-note-text mt-2">{timelineNoteBody(interaction.note)}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" className="text-link" onClick={() => setEditingId(interaction.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-link"
                    onClick={async () => {
                      if (!window.confirm('Delete this conversation?')) return
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
