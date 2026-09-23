import { Avatar } from './Avatar'
import { ReachLinks, ReachedOutButton } from './ReachActions'
import { formatCadence } from '../lib/cadence'
import { formatDisplayDate } from '../utils/dates'
import type { OverdueContact } from '../lib/overdue'

type ContactCardProps = {
  contact: OverdueContact
  busy: boolean
  featured?: boolean
  onReachedOut: (note: string | null) => void
  onSnooze: () => void
  onView: () => void
}

export function ContactCard({ contact, busy, featured = false, onReachedOut, onSnooze, onView }: ContactCardProps) {
  const overdueLabel =
    contact.days_overdue === 0
      ? 'Due today'
      : `${contact.days_overdue} day${contact.days_overdue === 1 ? '' : 's'} overdue`

  const lastTalked = contact.last_contact_date ? formatDisplayDate(contact.last_contact_date) : 'Never'

  return (
    <article className={featured ? 'home-card home-card-featured' : 'home-card'}>
      <button type="button" className="home-card-button" onClick={onView}>
        <div className="home-card-row">
          <Avatar name={contact.name} size="md" />
          <p className="home-card-time">{overdueLabel}</p>
        </div>
        <h3 className="home-card-title">{contact.name}</h3>
        <p className="home-card-body">
          Last talked {lastTalked} · {formatCadence(contact.cadence_days)}
        </p>
        {contact.nudge ? <p className="home-card-body">{contact.nudge}</p> : null}
      </button>
      <div className="home-card-actions">
        <ReachedOutButton
          label="I reached out"
          busy={busy}
          ariaLabel={`Mark that you reached out to ${contact.name} today`}
          onCommit={onReachedOut}
        />
        <button type="button" className="chip-action" onClick={onSnooze}>
          Not this week
        </button>
        <ReachLinks phone={contact.phone} email={contact.email} />
      </div>
    </article>
  )
}
