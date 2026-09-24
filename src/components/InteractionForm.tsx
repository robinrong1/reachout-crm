import { useState, type FormEvent } from 'react'
import { localToday } from '../lib/interactions'
import type { Interaction } from '../types/database'

type InteractionFormProps = {
  initial?: Interaction
  submitLabel: string
  onSubmit: (input: { occurred_on: string; note: string }) => Promise<void>
  onCancel?: () => void
}

export function InteractionForm({ initial, submitLabel, onSubmit, onCancel }: InteractionFormProps) {
  const [occurredOn, setOccurredOn] = useState(initial?.occurred_on ?? localToday())
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await onSubmit({ occurred_on: occurredOn, note })
      if (!initial) {
        setOccurredOn(localToday())
        setNote('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that conversation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className="flex max-w-lg flex-col gap-3 timeline-compose"
      onSubmit={handleSubmit}
      aria-busy={submitting}
    >
      <label className="flex flex-col gap-1 text-sm">
        When
        <input
          required
          type="date"
          name="occurred_on"
          max={localToday()}
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
          className="input-field"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        What happened (optional)
        <textarea
          name="note"
          rows={3}
          placeholder="Coffee, a call, a long text…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="input-field min-h-20 py-3"
        />
      </label>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
