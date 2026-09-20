import { ContactCard } from './ContactCard'
import type { OverdueContact } from '../lib/overdue'

type OverdueListProps = {
  contacts: OverdueContact[]
  reachingOutId: string | null
  onReachedOut: (id: string) => void
  onView: (id: string) => void
}

export function OverdueList({ contacts, reachingOutId, onReachedOut, onView }: OverdueListProps) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {contacts.map((contact) => (
        <li key={contact.id}>
          <ContactCard
            contact={contact}
            busy={reachingOutId === contact.id}
            onReachedOut={() => onReachedOut(contact.id)}
            onView={() => onView(contact.id)}
          />
        </li>
      ))}
    </ul>
  )
}
