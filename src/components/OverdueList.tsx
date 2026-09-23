import { sectionsUnderGroupHeadings } from '../lib/groupHeadings'
import { ContactCard } from './ContactCard'
import type { OverdueContact } from '../lib/overdue'

type OverdueListProps = {
  contacts: OverdueContact[]
  reachingOutId: string | null
  groupNameFor: (id: string) => string | null
  onReachedOut: (id: string, note: string | null) => void
  onSnooze: (id: string) => void
  onView: (id: string) => void
}

export function OverdueList({
  contacts,
  reachingOutId,
  groupNameFor,
  onReachedOut,
  onSnooze,
  onView,
}: OverdueListProps) {
  const sections = sectionsUnderGroupHeadings(contacts, (contact) => groupNameFor(contact.id))
  const leadId = contacts[0]?.id

  return (
    <div className="catch-up-groups">
      {sections.map((section) => (
        <section key={section.heading ?? 'main'} aria-label={section.heading ?? 'People to catch up with'}>
          {section.heading ? <h3 className="home-section-label">{section.heading}</h3> : null}
          <ul className="home-cards">
            {section.items.map((contact) => (
              <li key={contact.id}>
                <ContactCard
                  contact={contact}
                  featured={contact.id === leadId}
                  busy={reachingOutId === contact.id}
                  onReachedOut={(note) => onReachedOut(contact.id, note)}
                  onSnooze={() => onSnooze(contact.id)}
                  onView={() => onView(contact.id)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
