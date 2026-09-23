import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Avatar } from '../components/Avatar'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { listActiveContactOptions } from '../lib/contacts'
import { createInteraction, listTimeline, localToday } from '../lib/interactions'
import { groupTimelineByMonth, timelineEventLabel, timelineNoteBody, type TimelineItem } from '../lib/timeline'
import { formatDisplayDate, formatMonthHeading } from '../utils/dates'

function NoteIcon() {
  return (
    <span className="timeline-event-icon" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path
          d="M4.2 2.4h5.3L12.8 6v7.6H4.2V2.4Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M9.4 2.4V6h3.4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M6 9h4.2M6 11.2h2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </span>
  )
}

export function Timeline() {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [contactId, setContactId] = useState('')
  const [occurredOn, setOccurredOn] = useState(localToday())
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadTimeline() {
    const { data, error } = await listTimeline()
    if (error) {
      setError(error.message)
      setItems([])
    } else {
      setItems(data ?? [])
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([listTimeline(), listActiveContactOptions()]).then(([timelineResult, peopleResult]) => {
      if (cancelled) return
      if (timelineResult.error) {
        setError(timelineResult.error.message)
        setItems([])
      } else {
        setItems(timelineResult.data ?? [])
      }
      if (peopleResult.error) {
        setError(peopleResult.error.message)
      } else {
        setPeople(peopleResult.data ?? [])
      }
      if (!timelineResult.error && !peopleResult.error) setError(null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    if (!contactId) {
      setError('Pick someone this is about.')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await createInteraction({
      contact_id: contactId,
      occurred_on: occurredOn,
      note,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setNote('')
    setQuery('')
    setOccurredOn(localToday())
    setAdding(false)
    setLoading(true)
    await loadTimeline()
  }

  const months = groupTimelineByMonth(items)
  const selectedPerson = people.find((person) => person.id === contactId)
  const matches = people.filter((person) => person.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <section className="page-shell timeline-page" aria-labelledby="timeline-heading" aria-busy={loading}>
      <div className="timeline-header">
        <div className="masthead">
          <p className="masthead-eyebrow">Notes</p>
          <h2 id="timeline-heading" className="masthead-title">
            Timeline
          </h2>
        </div>
        {adding ? null : (
          <button type="button" className="btn btn-primary timeline-add" onClick={() => setAdding(true)}>
            + Add note
          </button>
        )}
      </div>

      {adding ? (
        <form
          className="timeline-compose"
          onSubmit={(event) => {
            void handleAdd(event)
          }}
          aria-busy={saving}
        >
          <label className="flex flex-col gap-1 text-sm">
            Who did you talk to?
            {selectedPerson ? (
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <span className="person-chip">
                  <Avatar name={selectedPerson.name} size="xs" />
                  <span>{selectedPerson.name}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setContactId('')
                    setQuery('')
                  }}
                >
                  Change
                </button>
              </span>
            ) : (
              <>
                <input
                  className="input-field"
                  type="search"
                  autoComplete="off"
                  placeholder="Search your people…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {people.length === 0 ? (
                  <p className="text-sm text-[var(--text)]">
                    Add someone from Contacts first, then you can log a conversation here.
                  </p>
                ) : (
                  <ul className="m-0 flex max-h-40 list-none flex-col gap-1 overflow-auto p-0">
                    {(query.trim() ? matches : people).map((person) => (
                      <li key={person.id}>
                        <button
                          type="button"
                          className="person-chip"
                          onClick={() => {
                            setContactId(person.id)
                            setQuery('')
                          }}
                        >
                          <Avatar name={person.name} size="xs" />
                          <span>{person.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            When
            <input
              required
              type="date"
              className="input-field"
              value={occurredOn}
              onChange={(event) => setOccurredOn(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Note
            <textarea
              rows={3}
              className="input-field min-h-20 py-3"
              placeholder="Dinner, a call, a long text…"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving || !contactId} className="btn btn-primary">
              {saving ? 'Saving…' : 'Add note'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setAdding(false)
                setError(null)
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => {
            setLoading(true)
            setError(null)
            void loadTimeline()
          }}
        />
      ) : null}

      {loading ? <p role="status">Loading…</p> : null}

      {!loading && items.length === 0 && !error ? (
        <EmptyState title="Nothing on the timeline yet." body="Add a note about someone you just saw or talked to." />
      ) : null}

      {!loading && months.length > 0 ? (
        <ol className="timeline-months">
          {months.map((month) => (
            <li key={month.key}>
              <h3 className="timeline-month">{formatMonthHeading(`${month.key}-01`)}</h3>
              <ul className="timeline-events">
                {month.items.map((item) => (
                  <li key={item.id} className="timeline-event">
                    <div className="timeline-event-meta">
                      <NoteIcon />
                      <p className="timeline-event-label">{timelineEventLabel(item.note)}</p>
                      <p className="timeline-event-date">{formatDisplayDate(item.occurred_on)}</p>
                    </div>
                    <div className="timeline-note">
                      {timelineNoteBody(item.note) ? (
                        <p className="timeline-note-text">{timelineNoteBody(item.note)}</p>
                      ) : null}
                      <Link
                        to={`/contacts/${item.contact_id}`}
                        state={{ from: '/timeline' }}
                        className="person-chip"
                      >
                        <Avatar name={item.contact_name} size="xs" />
                        <span>
                          {item.contact_name}
                          {item.archived ? ' · archived' : ''}
                        </span>
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
