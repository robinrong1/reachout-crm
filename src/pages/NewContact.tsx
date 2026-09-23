import { useNavigate } from 'react-router'
import { ContactForm } from '../components/ContactForm'
import { createContact } from '../lib/contacts'

export function NewContact() {
  const navigate = useNavigate()

  return (
    <section className="page-shell form-shell" aria-labelledby="new-person-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="masthead">
          <p className="masthead-eyebrow">New person</p>
          <h2 id="new-person-heading" className="masthead-title">
            Add someone
          </h2>
        </div>
        <button type="button" className="text-link self-start" onClick={() => navigate('/contacts')}>
          Back
        </button>
      </header>
      <ContactForm
        submitLabel="Add them"
        onSubmit={async (input) => {
          const { data, error } = await createContact(input)
          if (error) throw error
          if (!data) throw new Error('They were not added')
          navigate(`/contacts/${data.id}`)
        }}
      />
    </section>
  )
}
