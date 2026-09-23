import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ErrorBanner } from '../components/ErrorBanner'
import { McpAccess } from '../components/McpAccess'
import { disconnectGmail, getGmailConnection, startGmailConnect, type GmailConnectionStatus } from '../lib/gmail'
import { supabase } from '../lib/supabase'
import { WEEKDAYS, getUserProfile, isValidTimeZone, updateUserProfile } from '../lib/users'

export function Settings() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [day, setDay] = useState(1)
  const [timezone, setTimezone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getUserProfile().then(({ profile, error }) => {
      if (cancelled) return
      if (error || !profile) {
        setError(error?.message ?? 'Could not load settings')
      } else {
        setEmail(profile.email)
        setDay(profile.digest_day_of_week ?? 1)
        setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
        setError(null)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function save() {
    setInfo(null)
    if (!isValidTimeZone(timezone)) {
      setError('Timezone must be an IANA name, like America/Toronto')
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await updateUserProfile({ timezone, digest_day_of_week: day })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo(`You'll get the digest on ${WEEKDAYS[day]}.`)
  }

  return (
    <section className="page-shell feed-shell" aria-labelledby="settings-heading" aria-busy={loading}>
      <header className="masthead">
        <p className="masthead-eyebrow">Account</p>
        <h2 id="settings-heading" className="masthead-title">
          Settings
        </h2>
        {email ? <p className="page-kicker">{email}</p> : null}
      </header>

      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p role="status">Loading…</p> : null}

      {!loading ? (
        <form
          className="flex max-w-lg flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="text-sm">Email me on</legend>
            <div className="weekday-picker" role="group" aria-label="Digest day">
              {WEEKDAYS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className="preset-chip"
                  aria-pressed={day === index}
                  onClick={() => setDay(index)}
                >
                  {label.slice(0, 3)}
                </button>
              ))}
            </div>
            <p className="text-sm text-[var(--text)]">{WEEKDAYS[day]} morning, in your timezone.</p>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm">
            Timezone
            <input
              name="timezone"
              list="iana-zones"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="input-field"
              required
            />
            <TimezoneOptions />
          </label>

          {info ? (
            <p className="text-sm text-[var(--text)]" role="status">
              {info}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                void supabase.auth.signOut()
              }}
            >
              Sign out
            </button>
          </div>
        </form>
      ) : null}

      {!loading ? <GmailSettings connectError={params.get('gmail_error')} /> : null}
      {!loading ? <McpAccess /> : null}
    </section>
  )
}

function GmailSettings({ connectError }: { connectError: string | null }) {
  const [connection, setConnection] = useState<GmailConnectionStatus | null>(null)
  const [error, setError] = useState<string | null>(connectError)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getGmailConnection().then(({ data, error: loadError }) => {
      if (cancelled) return
      setConnection(data)
      if (loadError) setError(loadError.message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function connect() {
    setBusy(true)
    setError(null)
    try {
      const { error: connectFailure } = await startGmailConnect()
      if (connectFailure) setError(connectFailure.message)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start Gmail connect')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    setBusy(true)
    setError(null)
    const { error: disconnectError } = await disconnectGmail()
    setBusy(false)
    if (disconnectError) {
      setError(disconnectError.message)
      return
    }
    setConnection(null)
    setConfirmDisconnect(false)
  }

  return (
    <section className="flex max-w-lg flex-col gap-3 border-t border-[var(--border)] pt-8" aria-labelledby="gmail-heading">
      <h3 id="gmail-heading" className="m-0 font-[family-name:var(--heading)] text-2xl font-normal text-[var(--text-h)]">
        Gmail
      </h3>
      <p className="m-0 text-sm text-[var(--text)]">
        Reach reads email headers only — who you wrote, and when. Message bodies are not read. Nothing is saved until
        you accept a person.
      </p>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p role="status">Loading…</p> : null}
      {!loading && connection ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-[var(--text)]">
            Connected {new Date(connection.connected_at).toLocaleDateString()}. Disconnect deletes the stored token.
            People you already accepted stay.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/import/gmail" className="btn btn-primary">
              Review suggestions
            </Link>
            {confirmDisconnect ? (
              <>
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void disconnect()}>
                  {busy ? 'Disconnecting…' : 'Disconnect'}
                </button>
                <button type="button" className="text-link" onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="text-link" onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </button>
            )}
          </div>
        </div>
      ) : null}
      {!loading && !connection ? (
        <button type="button" className="btn btn-primary self-start" disabled={busy} onClick={() => void connect()}>
          {busy ? 'Opening Google…' : 'Connect Gmail'}
        </button>
      ) : null}
    </section>
  )
}

function TimezoneOptions() {
  const zones =
    typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl
      ? Intl.supportedValuesOf('timeZone')
      : ['UTC', 'America/Toronto', 'America/New_York', 'America/Los_Angeles', 'Europe/London']

  return (
    <datalist id="iana-zones">
      {zones.map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  )
}
