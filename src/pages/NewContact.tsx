import { ContactForm } from '../components/ContactForm'
import { createContact } from '../lib/contacts'

type NewContactProps = {
  onCancel: () => void
  onCreated: (id: string) => void
}

export function NewContact({ onCancel, onCreated }: NewContactProps) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-xl font-medium text-[var(--text-h)]">New contact</h2>
        <button
          type="button"
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm"
          onClick={onCancel}
        >
          Back
        </button>
      </div>
      <ContactForm
        submitLabel="Add contact"
        onSubmit={async (input) => {
          const { data, error } = await createContact(input)
          if (error) throw error
          if (!data) throw new Error('Contact was not created')
          onCreated(data.id)
        }}
      />
    </section>
  )
}
