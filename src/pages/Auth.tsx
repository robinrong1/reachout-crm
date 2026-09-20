import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up'

export function Auth() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    try {
      if (mode === 'sign-up') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) {
          setError(error.message)
          return
        }
        if (!data.session) {
          setInfo('Check your email to confirm your account, then sign in.')
        }
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const isSignUp = mode === 'sign-up'

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-6 py-12 text-left">
      <h1 className="mb-2 text-3xl font-medium tracking-tight text-[var(--text-h)]">
        Personal CRM
      </h1>
      <p className="mb-8 text-base text-[var(--text)]">
        {isSignUp ? 'Create an account to start tracking relationships.' : 'Sign in to continue.'}
      </p>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            name="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-base text-[var(--text-h)]"
          />
        </label>

        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        {info ? (
          <p className="text-sm text-[var(--text)]" role="status">
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-[var(--accent)] px-4 py-2 text-base text-white disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : isSignUp ? 'Sign up' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm">
        {isSignUp ? 'Already have an account?' : 'Need an account?'}{' '}
        <button
          type="button"
          className="underline"
          onClick={() => {
            setMode(isSignUp ? 'sign-in' : 'sign-up')
            setError(null)
            setInfo(null)
          }}
        >
          {isSignUp ? 'Sign in' : 'Sign up'}
        </button>
      </p>
    </main>
  )
}
