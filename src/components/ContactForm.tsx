import { useState, type FormEvent } from 'react'
import { CADENCE_PRESETS, DEFAULT_CADENCE_DAYS, cadencePresetForDays } from '../lib/cadence'
import { validateContactEmail } from '../lib/contactFields'
import type { Contact, ContactInsert } from '../types/database'

type ContactFormProps = {
  initial?: Contact
  submitLabel: string
  onSubmit: (input: ContactInsert) => Promise<void>
}

function emailError(value: string) {
  return validateContactEmail(value)?.message ?? null
}

export function CadenceField({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const matched = cadencePresetForDays(days)
  const [customMode, setCustomMode] = useState(matched === 'custom')
  const active = customMode ? 'custom' : matched

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">Stay in touch</span>
      <div className="cadence-presets" role="group" aria-label="Stay in touch">
        {CADENCE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-chip"
            aria-pressed={active === preset.id}
            onClick={() => {
              setCustomMode(false)
              onChange(preset.days)
            }}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="preset-chip"
          aria-pressed={active === 'custom'}
          onClick={() => setCustomMode(true)}
        >
          Custom
        </button>
      </div>
      {active === 'custom' ? (
        <label className="flex flex-col gap-1 text-sm">
          Every (days)
          <input
            required
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            name="cadence_days"
            value={Number.isInteger(days) && days > 0 ? days : ''}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10)
              if (Number.isInteger(next)) onChange(next)
            }}
            className="input-field"
          />
        </label>
      ) : null}
    </div>
  )
}

export function ContactForm({ initial, submitLabel, onSubmit }: ContactFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [relationshipType, setRelationshipType] = useState(initial?.relationship_type ?? '')
  const [cadenceDays, setCadenceDays] = useState(initial?.cadence_days ?? DEFAULT_CADENCE_DAYS)
  const [birthday, setBirthday] = useState(initial?.birthday ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [nudge, setNudge] = useState(initial?.nudge ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!Number.isInteger(cadenceDays) || cadenceDays <= 0) {
      setError('How often must be a whole number of days greater than 0')
      return
    }
    const invalidEmail = emailError(email)
    if (invalidEmail) {
      setError(invalidEmail)
      return
    }

    setSubmitting(true)
    try {
      await onSubmit({
        name,
        relationship_type: relationshipType,
        cadence_days: cadenceDays,
        birthday,
        phone,
        email,
        notes,
        nudge,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this person')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex max-w-lg flex-col gap-4" onSubmit={handleSubmit} aria-busy={submitting}>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          required
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="input-field"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        How you know them
        <input
          name="relationship_type"
          placeholder="Friend, sibling, neighbor…"
          value={relationshipType}
          onChange={(event) => setRelationshipType(event.target.value)}
          className="input-field"
        />
      </label>

      <CadenceField days={cadenceDays} onChange={setCadenceDays} />

      <label className="flex flex-col gap-1 text-sm">
        Phone
        <input
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="Optional"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="input-field"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Optional"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="input-field"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Birthday
        <input
          type="date"
          name="birthday"
          value={birthday}
          onChange={(event) => setBirthday(event.target.value)}
          className="input-field"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Nudge
        <input
          name="nudge"
          maxLength={140}
          placeholder="Ask about the new job"
          value={nudge}
          onChange={(event) => setNudge(event.target.value)}
          className="input-field"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Notes
        <textarea
          name="notes"
          rows={4}
          placeholder="Things you want to remember about them"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="input-field min-h-24 py-3"
        />
      </label>

      {error ? (
        <p className="text-sm text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={submitting} className="btn btn-primary self-start">
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
