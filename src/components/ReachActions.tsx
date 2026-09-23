import { useId, useState, type FormEvent } from 'react'

type ReachedOutButtonProps = {
  label: string
  busy: boolean
  onCommit: (note: string | null) => void
  className?: string
  ariaLabel?: string
}

/** Skippable one-line note. Skip still records today's date-only reach-out. */
export function ReachedOutButton({
  label,
  busy,
  onCommit,
  className = 'btn btn-primary',
  ariaLabel,
}: ReachedOutButtonProps) {
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (!open) {
    return (
      <button type="button" className={className} disabled={busy} aria-label={ariaLabel} onClick={() => setOpen(true)}>
        {busy ? 'Saving…' : label}
      </button>
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = note.trim()
    onCommit(trimmed ? trimmed : null)
  }

  return (
    <form className="reach-note" onSubmit={submit}>
      <label className="sr-only" htmlFor={fieldId}>
        What happened?
      </label>
      <input
        id={fieldId}
        className="input-field"
        placeholder="What happened?"
        value={note}
        disabled={busy}
        onChange={(event) => setNote(event.target.value)}
      />
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => onCommit(null)}>
        Skip
      </button>
    </form>
  )
}

export function smsHref(phone: string) {
  return `sms:${phone.trim().replace(/\s+/g, '')}`
}

export function mailHref(email: string) {
  return `mailto:${email.trim()}`
}

export function ReachLinks({ phone, email }: { phone: string | null | undefined; email: string | null | undefined }) {
  const sms = phone?.trim()
  const mail = email?.trim()
  if (!sms && !mail) return null

  return (
    <>
      {sms ? (
        <a className="home-card-link" href={smsHref(sms)}>
          Message
        </a>
      ) : null}
      {mail ? (
        <a className="home-card-link" href={mailHref(mail)}>
          Email
        </a>
      ) : null}
    </>
  )
}
