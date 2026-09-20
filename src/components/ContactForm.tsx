import { useState, type FormEvent } from 'react'
import type { Contact, ContactInsert } from '../types/database'

type ContactFormProps = {
  initial?: Contact
  submitLabel: string
  onSubmit: (input: ContactInsert) => Promise<void>
}

export function ContactForm({ initial, submitLabel, onSubmit }: ContactFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [relationshipType, setRelationshipType] = useState(initial?.relationship_type ?? '')
  const [cadenceDays, setCadenceDays] = useState(String(initial?.cadence_days ?? 30))
  const [birthday, setBirthday] = useState(initial?.birthday ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const cadence = Number.parseInt(cadenceDays, 10)
    if (!Number.isInteger(cadence) || cadence <= 0) {
      setError('Cadence must be a whole number of days greater than 0')
      setSubmitting(false)
      return
    }

    try {
      await onSubmit({
        name,
        relationship_type: relationshipType,
        cadence_days: cadence,
        birthday,
        notes,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save contact')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          required
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Relationship type
        <input
          name="relationship_type"
          placeholder="Friend, family, mentor…"
          value={relationshipType}
          onChange={(event) => setRelationshipType(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Cadence (days)
        <input
          required
          type="number"
          min={1}
          step={1}
          name="cadence_days"
          value={cadenceDays}
          onChange={(event) => setCadenceDays(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Birthday
        <input
          type="date"
          name="birthday"
          value={birthday}
          onChange={(event) => setBirthday(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea
          name="notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-base text-white disabled:opacity-60"
      >
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
