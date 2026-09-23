import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CadenceField } from '../components/ContactForm'
import { ErrorBanner } from '../components/ErrorBanner'
import { DEFAULT_CADENCE_DAYS } from '../lib/cadence'
import { createContact } from '../lib/contacts'
import { createInteraction } from '../lib/interactions'

const SKIP_KEY = 'reach-welcome-skipped'

type Row = {
  name: string
  relationship: string
  cadence: number
  lastTalked: string
}

function blankRow(): Row {
  return { name: '', relationship: '', cadence: DEFAULT_CADENCE_DAYS, lastTalked: '' }
}

export function Welcome() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([blankRow(), blankRow(), blankRow()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function update(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function skip() {
    sessionStorage.setItem(SKIP_KEY, '1')
    navigate('/', { replace: true })
  }

  async function finish() {
    const filled = rows.filter((row) => row.name.trim())
    if (filled.length < 3) {
      setError('Add three people, or skip for now.')
      return
    }

    setSaving(true)
    setError(null)
    for (const row of filled) {
      const created = await createContact({
        name: row.name,
        relationship_type: row.relationship,
        cadence_days: row.cadence,
      })
      if (created.error || !created.data) {
        setError(created.error?.message ?? 'Could not save these people')
        setSaving(false)
        return
      }
      if (row.lastTalked) {
        const interaction = await createInteraction({
          contact_id: created.data.id,
          occurred_on: row.lastTalked,
        })
        if (interaction.error) {
          setError(interaction.error.message)
          setSaving(false)
          return
        }
      }
    }
    sessionStorage.removeItem(SKIP_KEY)
    navigate('/', { replace: true })
  }

  return (
    <section className="page-shell feed-shell" aria-labelledby="welcome-heading">
      <header className="masthead">
        <p className="masthead-eyebrow">First three</p>
        <h2 id="welcome-heading" className="masthead-title">
          Who should Reach remember?
        </h2>
        <p className="page-kicker">
          A name, how you know them, and how often is enough. Leave last talked blank and they show up as due today.
        </p>
      </header>

      {error ? <ErrorBanner message={error} /> : null}

      <ol className="welcome-list">
        {rows.map((row, index) => (
          <li key={index} className="home-card">
            <p className="home-card-time">Person {index + 1}</p>
            <div className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Name
                <input
                  name={`name-${index}`}
                  autoComplete="name"
                  value={row.name}
                  onChange={(event) => update(index, { name: event.target.value })}
                  className="input-field"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                How you know them
                <input
                  name={`relationship-${index}`}
                  placeholder="Friend, sibling, neighbor…"
                  value={row.relationship}
                  onChange={(event) => update(index, { relationship: event.target.value })}
                  className="input-field"
                />
              </label>
              <CadenceField days={row.cadence} onChange={(cadence) => update(index, { cadence })} />
              <label className="flex flex-col gap-1 text-sm">
                Last talked
                <input
                  type="date"
                  name={`last-${index}`}
                  value={row.lastTalked}
                  onChange={(event) => update(index, { lastTalked: event.target.value })}
                  className="input-field"
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void finish()}>
          {saving ? 'Saving…' : 'Show me Home'}
        </button>
        <button type="button" className="text-link" disabled={saving} onClick={skip}>
          Skip
        </button>
      </div>
    </section>
  )
}

export function welcomeWasSkipped() {
  return sessionStorage.getItem(SKIP_KEY) === '1'
}
