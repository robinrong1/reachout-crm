import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import {
  changeLinks,
  describeAction,
  notifyDataChanged,
  sendAssistant,
  type ActionSummary,
  type AssistantRequest,
  type GeminiContent,
  type PendingAction,
} from '../lib/assistant'
import { MAX_MESSAGE_CHARS } from '../lib/assistantAgent'
import { ErrorBanner } from './ErrorBanner'

type ChatItem =
  | { id: number; kind: 'user'; text: string }
  | { id: number; kind: 'assistant'; text: string; links: { id: string; label: string }[] }
  | { id: number; kind: 'action'; summary: ActionSummary; status: 'pending' | 'approved' | 'declined' }

type NewChatItem = ChatItem extends infer Item ? (Item extends ChatItem ? Omit<Item, 'id'> : never) : never

const SUGGESTIONS = [
  { label: 'Who am I late to talk to?', send: true },
  { label: 'Add someone new: ', send: false },
  { label: 'I just had coffee with ', send: false },
]

/** Replies should be plain sentences; tidy up any markdown the model slips in anyway. */
function plainReply(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .trim()
}

type AssistantPanelProps = {
  open: boolean
  onClose: () => void
}

export function AssistantPanel({ open, onClose }: AssistantPanelProps) {
  const [transcript, setTranscript] = useState<GeminiContent[]>([])
  const [items, setItems] = useState<ChatItem[]>([])
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedRequest, setFailedRequest] = useState<{ request: AssistantRequest; fallbackName?: string } | null>(
    null,
  )
  const nextId = useRef(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [items, busy, error])

  function push(item: NewChatItem) {
    nextId.current += 1
    const next = { ...item, id: nextId.current } as ChatItem
    setItems((current) => [...current, next])
  }

  function settleAction(status: 'approved' | 'declined') {
    setItems((current) =>
      current.map((item) => (item.kind === 'action' && item.status === 'pending' ? { ...item, status } : item)),
    )
  }

  async function run(request: AssistantRequest, fallbackName?: string) {
    setBusy(true)
    setError(null)
    setFailedRequest(null)
    const { data, error: requestError } = await sendAssistant(request)
    setBusy(false)
    if (requestError || !data) {
      setError(requestError?.message ?? 'The assistant could not answer')
      setFailedRequest({ request, fallbackName })
      return
    }
    if (request.approval) settleAction(request.approval.approved ? 'approved' : 'declined')
    setTranscript(data.transcript)

    const links = changeLinks(data.toolEvents, fallbackName)
    if (data.toolEvents.some((event) => event.write && event.ok)) notifyDataChanged()
    const reply = data.reply ? plainReply(data.reply) : ''
    if (reply || links.length > 0) {
      push({ kind: 'assistant', text: reply || 'Done.', links })
    } else if (!data.pendingAction) {
      push({ kind: 'assistant', text: "I didn't get a reply that time. Try again.", links: [] })
    }

    setPending(data.pendingAction)
    if (data.pendingAction) {
      push({ kind: 'action', summary: describeAction(data.pendingAction), status: 'pending' })
    } else {
      inputRef.current?.focus()
    }
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const message = draft.trim()
    if (!message || busy || pending) return
    setDraft('')
    push({ kind: 'user', text: message })
    void run({ transcript, message })
  }

  function decide(approved: boolean) {
    if (!pending || busy) return
    void run({ transcript, approval: { approved } }, pending.contactName)
  }

  function retry() {
    if (!failedRequest || busy) return
    void run(failedRequest.request, failedRequest.fallbackName)
  }

  function startOver() {
    setTranscript([])
    setItems([])
    setPending(null)
    setError(null)
    setFailedRequest(null)
    setDraft('')
    inputRef.current?.focus()
  }

  function applySuggestion(label: string, send: boolean) {
    if (send) {
      push({ kind: 'user', text: label })
      void run({ transcript, message: label })
      return
    }
    setDraft(label)
    inputRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) submit(event)
  }

  function closeOnSmallScreens() {
    if (window.matchMedia('(max-width: 767px)').matches) onClose()
  }

  return (
    <aside
      id="assistant-panel"
      className="assistant-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="assistant-title"
      hidden={!open}
    >
      <header className="assistant-header">
        <div>
          <p className="home-eyebrow">Assistant</p>
          <h2 id="assistant-title" className="assistant-title">
            Ask Reach
          </h2>
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 ? (
            <button type="button" className="chip-action" onClick={startOver} disabled={busy}>
              New chat
            </button>
          ) : null}
          <button type="button" className="assistant-close" onClick={onClose} aria-label="Close assistant">
            ×
          </button>
        </div>
      </header>

      <div ref={logRef} className="assistant-log" aria-live="polite" aria-busy={busy}>
        {items.length === 0 ? (
          <div className="assistant-empty">
            <p className="assistant-empty-lead">
              Add people, log conversations, or ask who you're due to catch up with. I'll check with you before
              changing anything.
            </p>
            <ul className="assistant-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion.label}>
                  <button
                    type="button"
                    className="chip"
                    onClick={() => applySuggestion(suggestion.label, suggestion.send)}
                    disabled={busy}
                  >
                    {suggestion.label.trim()}
                    {suggestion.send ? '' : '…'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {items.map((item) => {
          if (item.kind === 'user') {
            return (
              <p key={item.id} className="assistant-msg assistant-msg-user">
                {item.text}
              </p>
            )
          }
          if (item.kind === 'assistant') {
            return (
              <div key={item.id} className="assistant-msg assistant-msg-reply">
                <p>{item.text}</p>
                {item.links.length > 0 ? (
                  <div className="assistant-links">
                    {item.links.map((link) => (
                      <Link
                        key={`${item.id}-${link.id}-${link.label}`}
                        to={`/contacts/${link.id}`}
                        className="person-chip"
                        onClick={closeOnSmallScreens}
                      >
                        {link.label} →
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          }
          return (
            <section
              key={item.id}
              className="assistant-action"
              data-status={item.status}
              aria-label={`Proposed change: ${item.summary.title}`}
            >
              <p className="home-card-time">
                {item.status === 'pending' ? 'Check this first' : item.status === 'approved' ? 'Approved' : 'Cancelled'}
              </p>
              <h3 className="assistant-action-title">{item.summary.title}</h3>
              {item.summary.details.length > 0 ? (
                <ul className="assistant-action-details">
                  {item.summary.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
              {item.status === 'pending' ? (
                <div className="home-card-actions">
                  <button type="button" className="btn btn-primary" onClick={() => decide(true)} disabled={busy}>
                    Approve
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => decide(false)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              ) : null}
            </section>
          )
        })}

        {busy ? (
          <p className="assistant-thinking" role="status">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span className="sr-only">Thinking…</span>
          </p>
        ) : null}

        {error ? <ErrorBanner message={error} onRetry={failedRequest ? retry : undefined} /> : null}
      </div>

      <form className="assistant-compose" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-input">
          Message the assistant
        </label>
        <textarea
          id="assistant-input"
          ref={inputRef}
          className="input-field assistant-input"
          rows={2}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={pending ? 'Approve or cancel the change above' : 'Ask or tell Reach something…'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={Boolean(pending)}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || Boolean(pending) || !draft.trim()}>
          Send
        </button>
      </form>
    </aside>
  )
}
