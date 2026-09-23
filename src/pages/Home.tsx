import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { ErrorBanner } from '../components/ErrorBanner'
import { ReachLinks, ReachedOutButton } from '../components/ReachActions'
import { listContacts, snoozeForAWeek, type ContactListItem } from '../lib/contacts'
import { primaryGroupName, sectionsUnderGroupHeadings } from '../lib/groupHeadings'
import { listGroups } from '../lib/groups'
import {
  buildCatchUp,
  buildUpcomingBirthdays,
  catchUpCardCopy,
  groupHomeFeed,
  type CatchUpItem,
  type UpcomingBirthday,
} from '../lib/home'
import { reachedOutToday } from '../lib/interactions'
import { listOverdueContacts, type OverdueContact } from '../lib/overdue'
import { getUserTimezone } from '../lib/users'
import { formatMonthDay, formatWeekday, todayInTimeZone } from '../utils/dates'
import type { Group } from '../types/database'

function FlowerMark() {
  return (
    <span className="home-mark" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="8" r="4.2" fill="#e8c9b0" />
        <circle cx="20" cy="14" r="4.2" fill="#d9b8c8" />
        <circle cx="14" cy="20" r="4.2" fill="#c9d6b8" />
        <circle cx="8" cy="14" r="4.2" fill="#ead7a4" />
        <circle cx="14" cy="14" r="2.4" fill="#6a4b12" />
      </svg>
    </span>
  )
}

function CakeMark() {
  return (
    <span className="home-mark home-mark-cake" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 2.2v2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M6.2 7.2h3.6c.9 0 1.6.7 1.6 1.6v4.4H4.6V8.8c0-.9.7-1.6 1.6-1.6Z" stroke="currentColor" strokeWidth="1.3" />
        <path d="M4.6 10.4h6.8" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </span>
  )
}

function CatchUpCard({
  people,
  featured,
  busyId,
  channels,
  onOpen,
  onReach,
  onSnooze,
  groupName,
}: {
  people: CatchUpItem[]
  featured: boolean
  busyId: string | null
  channels: (id: string) => { phone: string | null; email: string | null }
  onOpen: (id: string) => void
  onReach: (id: string, note: string | null) => void
  onSnooze: (id: string) => void
  groupName: (id: string) => string | null
}) {
  const shown = people.slice(0, 5)
  const grouped = sectionsUnderGroupHeadings(shown, (person) => groupName(person.id))
  const copy = catchUpCardCopy(people)

  return (
    <article className={featured ? 'home-card home-card-featured' : 'home-card'}>
      <div className="home-card-row">
        <div className="home-avatars" aria-hidden="true">
          {shown.map((person) => (
            <Avatar key={person.id} name={person.name} size="md" />
          ))}
        </div>
        <p className="home-card-time">This week</p>
      </div>
      <h3 className="home-card-title">{copy.title}</h3>
      <p className="home-card-body">{copy.body}</p>
      <div className="home-card-actions">
        {grouped.map((section) => (
          <div key={section.heading ?? 'main'} className="home-group">
            {section.heading ? <p className="home-group-heading">{section.heading}</p> : null}
            {section.items.map((person) => {
              const channel = channels(person.id)
              return (
                <span key={person.id} className="home-person-action">
                  <button type="button" className="person-chip" onClick={() => onOpen(person.id)}>
                    <Avatar name={person.name} size="xs" />
                    {person.name}
                  </button>
                  {person.nudge ? <span className="home-nudge">{person.nudge}</span> : null}
                  <ReachedOutButton
                    label="Reached out"
                    className="chip-action"
                    busy={busyId === person.id}
                    ariaLabel={`Mark that you reached out to ${person.name} today`}
                    onCommit={(note) => onReach(person.id, note)}
                  />
                  <button type="button" className="chip-action" onClick={() => onSnooze(person.id)}>
                    Not this week
                  </button>
                  <ReachLinks phone={channel.phone} email={channel.email} />
                </span>
              )
            })}
          </div>
        ))}
        {copy.linkToCatchUp ? (
          <Link to="/keep-in-touch" className="home-card-link">
            Catch up
          </Link>
        ) : null}
      </div>
    </article>
  )
}

function BirthdayCard({
  person,
  featured,
  busy,
  phone,
  email,
  onOpen,
  onWished,
}: {
  person: UpcomingBirthday
  featured: boolean
  busy: boolean
  phone: string | null
  email: string | null
  onOpen: (id: string) => void
  onWished: (note: string | null) => void
}) {
  const when = person.daysUntil === 0 ? 'Today' : formatWeekday(person.nextOn)

  return (
    <article className={featured ? 'home-card home-card-featured home-card-birthday' : 'home-card home-card-birthday'}>
      <button type="button" className="home-card-button" onClick={() => onOpen(person.id)}>
        <div className="home-card-row">
          <span className="home-avatar-stack">
            <Avatar name={person.name} size="md" />
            <CakeMark />
          </span>
          <p className="home-card-time">{when}</p>
        </div>
        <h3 className="home-card-title">
          {person.daysUntil === 0
            ? `Wish ${person.name} a happy birthday.`
            : `${person.name}'s birthday is ${formatWeekday(person.nextOn)}.`}
        </h3>
        <p className="home-card-body">{formatMonthDay(person.nextOn)}</p>
      </button>
      <div className="home-card-actions">
        <ReachedOutButton
          label="Wished them"
          busy={busy}
          ariaLabel={`Log that you wished ${person.name} a happy birthday`}
          onCommit={onWished}
        />
        <ReachLinks phone={phone} email={email} />
      </div>
    </article>
  )
}

export function Home() {
  const navigate = useNavigate()
  const [contacts, setContacts] = useState<ContactListItem[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [overdue, setOverdue] = useState<OverdueContact[]>([])
  const [today, setToday] = useState(() =>
    todayInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const [overdueResult, contactsResult, timezoneResult, groupResult] = await Promise.all([
      listOverdueContacts(),
      listContacts(false),
      getUserTimezone(),
      listGroups(),
    ])

    const zone = timezoneResult.timezone || 'UTC'
    setToday(todayInTimeZone(zone))

    if (overdueResult.error) {
      setError(overdueResult.error.message)
      setOverdue([])
    } else {
      setOverdue(overdueResult.data ?? [])
    }

    if (contactsResult.error) {
      setError(contactsResult.error.message)
      setContacts([])
    } else {
      setContacts(contactsResult.data ?? [])
    }

    if (timezoneResult.error) {
      setError(timezoneResult.error.message)
    }

    if (groupResult.error) {
      setError(groupResult.error.message)
      setGroups([])
    } else {
      setGroups(groupResult.data ?? [])
    }

    if (!overdueResult.error && !contactsResult.error && !timezoneResult.error && !groupResult.error) {
      setError(null)
    }
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    void Promise.all([listOverdueContacts(), listContacts(false), getUserTimezone(), listGroups()]).then(
      ([overdueResult, contactsResult, timezoneResult, groupResult]) => {
        if (cancelled) return
        const zone = timezoneResult.timezone || 'UTC'
        setToday(todayInTimeZone(zone))
        if (overdueResult.error) {
          setError(overdueResult.error.message)
          setOverdue([])
        } else {
          setOverdue(overdueResult.data ?? [])
        }
        if (contactsResult.error) {
          setError(contactsResult.error.message)
          setContacts([])
        } else {
          setContacts(contactsResult.data ?? [])
        }
        if (timezoneResult.error) setError(timezoneResult.error.message)
        if (groupResult.error) {
          setError(groupResult.error.message)
          setGroups([])
        } else {
          setGroups(groupResult.data ?? [])
        }
        if (!overdueResult.error && !contactsResult.error && !timezoneResult.error && !groupResult.error) {
          setError(null)
        }
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const catchUp = today ? buildCatchUp(overdue, contacts, today) : []
  const birthdays = today ? buildUpcomingBirthdays(contacts, today) : []
  const sections = groupHomeFeed(catchUp, birthdays)
  const hasPeople = contacts.length > 0
  const emptyWeek = hasPeople && sections.length === 0
  const dateLabel = today ? `${formatWeekday(today)} · ${formatMonthDay(today)}` : ''

  function openContact(id: string) {
    navigate(`/contacts/${id}`, { state: { from: '/' } })
  }

  function groupNameFor(id: string) {
    const row = contacts.find((contact) => contact.id === id)
    return primaryGroupName(row?.group_ids ?? [], groups)
  }

  function channelsFor(id: string) {
    const row = contacts.find((contact) => contact.id === id)
    return { phone: row?.phone ?? null, email: row?.email ?? null }
  }

  async function snooze(id: string) {
    if (!today) return
    setBusyId(id)
    setError(null)
    const { error: snoozeError } = await snoozeForAWeek(id, today)
    setBusyId(null)
    if (snoozeError) {
      setError(snoozeError.message)
      return
    }
    setLoading(true)
    await load()
  }

  async function markReached(id: string, note: string | null) {
    setBusyId(id)
    setError(null)
    const { error: reachError } = await reachedOutToday(id, note)
    setBusyId(null)
    if (reachError) {
      setError(reachError.message)
      return
    }
    setLoading(true)
    await load()
  }

  return (
    <section className="home-page" aria-labelledby="home-heading" aria-busy={loading}>
      <header className="home-masthead">
        <p className="home-eyebrow">{dateLabel || 'This week'}</p>
        <h2 id="home-heading" className="home-title">
          Home
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

      {loading ? (
        <div>
          <p className="sr-only" role="status">
            Loading…
          </p>
          <ol className="home-cards" aria-hidden="true">
            <li className="home-card home-skeleton" />
            <li className="home-card home-skeleton" />
          </ol>
        </div>
      ) : null}

      {!loading && !hasPeople && !error ? (
        <ol className="home-sections">
          <li>
            <h3 className="home-section-label">Today</h3>
            <article className="home-card home-card-featured">
              <div className="home-card-row">
                <FlowerMark />
                <p className="home-card-time">Welcome</p>
              </div>
              <h3 className="home-card-title">Welcome to Reach.</h3>
              <p className="home-card-body">
                Add someone you care about, pick a cadence, and this page will surface who to catch up with.
              </p>
              <div className="home-card-actions">
                <Link to="/contacts/new" className="home-card-link">
                  Add someone
                </Link>
              </div>
            </article>
          </li>
        </ol>
      ) : null}

      {!loading && emptyWeek && !error ? (
        <ol className="home-sections">
          <li>
            <h3 className="home-section-label">This week</h3>
            <article className="home-card home-card-quiet">
              <div className="home-card-row">
                <FlowerMark />
                <p className="home-card-time">Quiet</p>
              </div>
              <h3 className="home-card-title">You're caught up this week.</h3>
              <p className="home-card-body">
                Nobody is overdue or due soon, and no birthdays land in the next seven days.
              </p>
            </article>
          </li>
        </ol>
      ) : null}

      {!loading && sections.length > 0 ? (
        <ol className="home-sections">
          {sections.map((section, sectionIndex) => (
            <li key={section.label}>
              <h3 className="home-section-label">{section.label}</h3>
              <ol className="home-cards">
                {section.catchUp.length > 0 ? (
                  <li>
                    <CatchUpCard
                      people={section.catchUp}
                      featured={sectionIndex === 0}
                      busyId={busyId}
                      channels={channelsFor}
                      onOpen={openContact}
                      onReach={(id, note) => {
                        void markReached(id, note)
                      }}
                      onSnooze={(id) => {
                        void snooze(id)
                      }}
                      groupName={groupNameFor}
                    />
                  </li>
                ) : null}
                {section.birthdays.map((person, index) => (
                  <li key={person.id}>
                    <BirthdayCard
                      person={person}
                      featured={sectionIndex === 0 && section.catchUp.length === 0 && index === 0}
                      busy={busyId === person.id}
                      phone={channelsFor(person.id).phone}
                      email={channelsFor(person.id).email}
                      onOpen={openContact}
                      onWished={(note) => {
                        void markReached(person.id, note)
                      }}
                    />
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
