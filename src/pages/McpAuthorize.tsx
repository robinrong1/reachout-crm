import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ErrorBanner } from '../components/ErrorBanner'
import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase'

type ClientInfo = { client_name: string }

export function McpAuthorize() {
  const [params] = useSearchParams()
  const clientId = params.get('client_id') ?? ''
  const redirectUri = params.get('redirect_uri') ?? ''
  const challenge = params.get('code_challenge') ?? ''
  const method = params.get('code_challenge_method') ?? ''
  const state = params.get('state') ?? ''
  const resource = params.get('resource') ?? ''
  const responseType = params.get('response_type') ?? 'code'

  const [client, setClient] = useState<ClientInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const redirectHost = hostOf(redirectUri)

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    void fetch(`${supabaseUrl}/functions/v1/mcp?oauth=client&client_id=${encodeURIComponent(clientId)}`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { client_name?: string; error?: string } | null
        if (cancelled) return
        if (!response.ok || !body?.client_name) {
          setError(body?.error ?? 'This app is not registered.')
          return
        }
        setClient({ client_name: body.client_name })
      })
      .catch(() => {
        if (!cancelled) setError('Could not look up that app.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  async function decide(decision: 'allow' | 'deny') {
    setBusy(true)
    setError(null)
    const { data } = await supabase.auth.getSession()
    const access = data.session?.access_token
    if (!access) {
      setBusy(false)
      setError('Sign in again, then allow the connection.')
      return
    }
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/mcp?oauth=approve`, {
        method: 'POST',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: challenge,
          code_challenge_method: method || 'S256',
          state,
          resource,
        }),
      })
      const body = (await response.json().catch(() => null)) as { redirect?: string; error?: string } | null
      if (!response.ok || !body?.redirect) {
        setError(body?.error ?? 'Could not finish sign-in.')
        setBusy(false)
        return
      }
      window.location.assign(body.redirect)
    } catch {
      setError('Could not finish sign-in.')
      setBusy(false)
    }
  }

  const ready = responseType === 'code' && Boolean(challenge) && method !== 'plain'

  return (
    <section className="page-shell" aria-labelledby="oauth-heading">
      <header className="masthead">
        <p className="masthead-eyebrow">Assistant</p>
        <h2 id="oauth-heading" className="masthead-title">
          {client ? `Allow ${client.client_name}?` : 'Connect an assistant'}
        </h2>
      </header>
      <p className="max-w-lg text-sm text-[var(--text)]">
        This lets the app see your people and log conversations. Reach does not draft messages, and the app cannot
        delete anyone.
        {redirectHost ? ` You will be sent back to ${redirectHost}.` : ''}
      </p>
      {!clientId ? <ErrorBanner message="This sign-in link is missing the app that asked to connect." /> : null}
      {error ? <ErrorBanner message={error} /> : null}
      {clientId && loading ? <p role="status">Loading…</p> : null}
      {!loading && client && !ready ? (
        <ErrorBanner message="This sign-in request is missing a PKCE challenge." />
      ) : null}
      {!loading && client && ready ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void decide('allow')}>
            {busy ? 'Connecting…' : 'Allow'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void decide('deny')}>
            Don’t allow
          </button>
        </div>
      ) : null}
    </section>
  )
}

function hostOf(uri: string) {
  try {
    return new URL(uri).host
  } catch {
    return ''
  }
}
