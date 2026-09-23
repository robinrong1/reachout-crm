import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ErrorBanner } from '../components/ErrorBanner'
import { createContact, listContacts } from '../lib/contacts'
import { loadGmailSuggestions } from '../lib/gmail'
import type { GmailSuggestion } from '../lib/gmail-import'

async function fetchReview() {
  const existing = await listContacts(false)
  if (existing.error) {
    return { error: existing.error.message, people: null as GmailSuggestion[] | null, needsConnect: false }
  }
  const emails = (existing.data ?? []).map((contact) => contact.email).filter((email): email is string => Boolean(email))
  const result = await loadGmailSuggestions(emails)
  if (result.error || !result.data) {
    return {
      error: result.code === 'not_connected' ? null : (result.error?.message ?? 'Could not read Gmail headers'),
      people: null as GmailSuggestion[] | null,
      needsConnect: result.code === 'not_connected',
    }
  }
  return { error: null, people: result.data, needsConnect: false }
}

export function GmailReview() {
  const [people, setPeople] = useState<GmailSuggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsConnect, setNeedsConnect] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyEmail, setBusyEmail] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  function show(result: Awaited<ReturnType<typeof fetchReview>>) {
    setError(result.error)
    setNeedsConnect(result.needsConnect)
    setPeople(result.people)
    setLoading(false)
  }

  function load() {
    setLoading(true)
    setError(null)
    setNeedsConnect(false)
    void fetchReview().then(show)
  }

  useEffect(() => {
    let cancelled = false
    void fetchReview().then((result) => {
      if (!cancelled) show(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function accept(person: GmailSuggestion) {
    setBusyEmail(person.email)
    setError(null)
    const { error: createError } = await createContact({
      name: person.name,
      email: person.email,
      cadence_days: 30,
      source: 'gmail_import',
    })
    setBusyEmail(null)
    if (createError) {
      setError(createError.message)
      return
    }
    setAdded(person.name)
    setPeople((current) => current?.filter((row) => row.email !== person.email) ?? [])
  }

  function skip(email: string) {
    setPeople((current) => current?.filter((row) => row.email !== email) ?? [])
  }

  return (
    <section className="page-shell feed-shell" aria-labelledby="gmail-review-heading" aria-busy={loading}>
      <header className="masthead">
        <p className="masthead-eyebrow">Gmail</p>
        <h2 id="gmail-review-heading" className="masthead-title">
          People you write
        </h2>
        <p className="page-kicker">
          Headers only, from recent inbox and sent mail. Nothing is saved until you accept someone.
        </p>
      </header>

      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
      {added ? (
        <p className="text-sm text-[var(--text)]" role="status">
          Added {added}. They’ll show on Home until you reach out.
        </p>
      ) : null}

      {loading ? <p role="status">Reading headers…</p> : null}

      {needsConnect ? (
        <p>
          Connect Gmail in{' '}
          <Link to="/settings" className="text-link">
            Settings
          </Link>{' '}
          before reviewing suggestions.
        </p>
      ) : null}

      {people && people.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-sm text-[var(--text)]">Skipping adds no one.</p>
            <Link to="/" className="btn btn-secondary">
              Skip the rest
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {people.map((person) => (
              <li key={person.email} className="conversation-note flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-[var(--text-h)]">{person.name}</p>
                  <p className="m-0 text-sm text-[var(--text)]">{person.email}</p>
                  <p className="m-0 text-sm text-[var(--text)]">{person.messageCount} emails between you</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => skip(person.email)}>
                    Skip
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyEmail === person.email}
                    onClick={() => void accept(person)}
                  >
                    {busyEmail === person.email ? 'Adding…' : 'Accept'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {people && people.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p>No one new to suggest. Newsletters and one-way mail are left out.</p>
          <Link to="/" className="text-link">
            Back to Home
          </Link>
        </div>
      ) : null}
    </section>
  )
}
