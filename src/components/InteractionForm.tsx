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
      setError(err instanceof Error ? err.message : 'Could not save interaction')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm">
        Date
        <input
          required
          type="date"
          name="occurred_on"
          value={occurredOn}
          onChange={(event) => setOccurredOn(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Note (optional)
        <textarea
          name="note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
        />
      </label>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-60"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  )
}
