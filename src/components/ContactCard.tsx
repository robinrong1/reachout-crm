import { formatDisplayDate } from '../utils/dates'
import type { OverdueContact } from '../lib/overdue'

type ContactCardProps = {
  contact: OverdueContact
  busy: boolean
  onReachedOut: () => void
  onView: () => void
}

export function ContactCard({ contact, busy, onReachedOut, onView }: ContactCardProps) {
  const overdueLabel =
    contact.days_overdue === 0
      ? 'Due today'
      : `Overdue by ${contact.days_overdue} day${contact.days_overdue === 1 ? '' : 's'}`

  return (
    <article className="flex flex-col gap-3 rounded-md border border-[var(--border)] px-4 py-4">
      <p className="m-0 text-sm font-medium text-[var(--accent)]">{overdueLabel}</p>
      <h3 className="m-0 text-lg font-medium text-[var(--text-h)]">{contact.name}</h3>
      <p className="m-0 text-sm text-[var(--text)]">
        Last contacted: {formatDisplayDate(contact.last_contact_date)}
      </p>
      <p className="m-0 text-sm text-[var(--text)]">Cadence: every {contact.cadence_days} days</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-60"
          onClick={onReachedOut}
        >
          {busy ? 'Saving…' : 'Reached out today'}
        </button>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          onClick={onView}
        >
          View
        </button>
      </div>
    </article>
  )
}
