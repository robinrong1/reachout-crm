import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ErrorBanner } from '../components/ErrorBanner'
import { completeGmailConnect } from '../lib/gmail'

const exchanges = new Map<string, Promise<{ error: Error | null }>>()

export function GmailCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const code = params.get('code')
  const state = params.get('state')
  const oauthError = params.get('error')

  useEffect(() => {
    if (oauthError || !code || !state) return
    let pending = exchanges.get(code)
    if (!pending) {
      pending = completeGmailConnect(code, state)
      exchanges.set(code, pending)
    }
    let cancelled = false
    void pending.then((result) => {
      if (cancelled) return
      if (result.error) {
        exchanges.delete(code)
        setError(result.error.message)
        return
      }
      navigate('/import/gmail', { replace: true })
    })
    return () => {
      cancelled = true
    }
  }, [code, navigate, oauthError, state])

  return (
    <section className="page-shell feed-shell" aria-labelledby="gmail-callback-heading">
      <header className="masthead">
        <p className="masthead-eyebrow">Gmail</p>
        <h2 id="gmail-callback-heading" className="masthead-title">
          Connecting
        </h2>
      </header>
      {oauthError ? (
        <ErrorBanner message="Gmail connect was cancelled." />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : (
        <p role="status">Saving the connection…</p>
      )}
      {oauthError || error ? (
        <Link to="/settings" className="text-link">
          Back to Settings
        </Link>
      ) : null}
    </section>
  )
}
