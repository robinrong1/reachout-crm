import { useEffect, useState, type FormEvent } from 'react'
import { ErrorBanner } from './ErrorBanner'
import { createMcpToken, listMcpTokens, revokeMcpToken, type McpTokenRow } from '../lib/mcpTokens'
import { supabaseUrl } from '../lib/supabase'

export function McpAccess() {
  const [tokens, setTokens] = useState<McpTokenRow[] | null>(null)
  const [label, setLabel] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listMcpTokens().then(({ data, error: loadError }) => {
      if (cancelled) return
      setTokens(data)
      if (loadError) setError(loadError.message)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await createMcpToken(label)
    setBusy(false)
    if (result.error || !result.token || !result.data) {
      setError(result.error?.message ?? 'Could not create a token')
      return
    }
    setFresh(result.token)
    setLabel('')
    setTokens((current) => [result.data!, ...(current ?? [])])
  }

  async function revoke(id: string) {
    setError(null)
    const { error: revokeError } = await revokeMcpToken(id)
    if (revokeError) {
      setError(revokeError.message)
      return
    }
    setTokens(
      (current) =>
        current?.map((token) =>
          token.id === id ? { ...token, revoked_at: new Date().toISOString() } : token,
        ) ?? [],
    )
  }

  const endpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/mcp` : ''

  return (
    <section className="flex max-w-lg flex-col gap-3 border-t border-[var(--border)] pt-8" aria-labelledby="mcp-heading">
      <h3 id="mcp-heading" className="m-0 font-[family-name:var(--heading)] text-2xl font-normal text-[var(--text-h)]">
        Assistant
      </h3>
      <p className="m-0 text-sm text-[var(--text)]">
        A desktop client can open Reach and ask you to allow it. Or create a token here for a client that cannot
        open a browser. Reach does not draft messages. A connection can look people up and write. It cannot delete
        anyone.
      </p>
      {endpoint ? (
        <p className="m-0 text-sm text-[var(--text)]">
          Server <span className="break-all text-[var(--text-h)]">{endpoint}</span>
        </p>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      {fresh ? (
        <div className="conversation-note flex flex-col gap-2">
          <p className="m-0 text-sm text-[var(--text)]">Copy this token now. It won’t be shown again.</p>
          <input className="input-field" readOnly value={fresh} aria-label="New assistant token" />
        </div>
      ) : null}
      {loading ? <p role="status">Loading…</p> : null}
      {tokens && tokens.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--text-h)]">
                {token.label}
                {token.revoked_at ? <span className="text-[var(--text)]"> · revoked</span> : null}
              </span>
              {token.revoked_at ? null : (
                <button type="button" className="text-link" onClick={() => void revoke(token.id)}>
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => void create(event)}>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          Name
          <input
            className="input-field"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Claude"
            maxLength={40}
            required
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </form>
    </section>
  )
}