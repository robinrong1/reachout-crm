import { useState, type FormEvent } from 'react'
import { BrandHeading, BrandMark } from '../components/BrandMark'
import { ErrorBanner } from '../components/ErrorBanner'
import { supabase } from '../lib/supabase'

type View = 'landing' | 'magic' | 'password' | 'reset'

export function Auth() {
  const [view, setView] = useState<View>('landing')

  return (
    <main className="auth-page">
      {view === 'landing' ? <Landing onMagic={() => setView('magic')} onPassword={() => setView('password')} /> : null}
      {view === 'magic' ? <MagicLink onBack={() => setView('landing')} onPassword={() => setView('password')} /> : null}
      {view === 'password' ? (
        <PasswordAuth onBack={() => setView('landing')} onMagic={() => setView('magic')} onReset={() => setView('reset')} />
      ) : null}
      {view === 'reset' ? <RequestReset onBack={() => setView('password')} /> : null}
      <p className="flex justify-center gap-4 px-6 pb-8 text-sm">
        <a className="text-link" href="/privacy">
          Privacy
        </a>
        <a className="text-link" href="/terms">
          Terms
        </a>
        <a className="text-link" href="mailto:robinyrong@gmail.com">
          Contact
        </a>
      </p>
    </main>
  )
}

function Landing({ onMagic, onPassword }: { onMagic: () => void; onPassword: () => void }) {
  return (
    <div className="landing">
      <header className="landing-brand">
        <BrandMark />
        <p className="font-[family-name:var(--heading)] text-xl text-[var(--text-h)]">Reach</p>
      </header>
      <div className="landing-copy">
        <h1 className="landing-title">A quiet reminder of the people you meant to stay close to.</h1>
        <p className="page-kicker">
          Home tells you who is due. Catch up is the list. A person page is where the conversation lives.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" className="btn btn-primary min-h-11" onClick={onMagic}>
            Email me a sign-in link
          </button>
          <button type="button" className="text-link" onClick={onPassword}>
            Use a password
          </button>
        </div>
      </div>
      <div className="landing-stills" aria-hidden="true">
        <article className="home-card home-card-featured">
          <p className="home-card-time">Home</p>
          <h2 className="home-card-title">Wish Maya a happy birthday.</h2>
          <p className="home-card-body">Today</p>
        </article>
        <article className="home-card">
          <p className="home-card-time">Catch up</p>
          <h2 className="home-card-title">Jamie</h2>
          <p className="home-card-body">Last talked Never · Due today</p>
        </article>
        <article className="home-card">
          <p className="home-card-time">Person</p>
          <h2 className="home-card-title">Sam</h2>
          <p className="home-card-body">Reached out · Message</p>
        </article>
      </div>
    </div>
  )
}

function MagicLink({ onBack, onPassword }: { onBack: () => void; onPassword: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.pathname.startsWith('/oauth/authorize')
          ? window.location.href
          : window.location.origin,
      },
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo('Check your email for a sign-in link. Open it and you will land back here signed in.')
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandHeading />
      <header className="masthead mb-8">
        <p className="masthead-eyebrow">Sign in</p>
        <h1 className="masthead-title">Email me a link</h1>
        <p className="page-kicker">No password. The link signs you in, including the first time.</p>
      </header>
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
            className="input-field"
          />
        </label>
        {error ? <ErrorBanner message={error} /> : null}
        {info ? (
          <p className="text-sm text-[var(--text)]" role="status">
            {info}
          </p>
        ) : null}
        <button type="submit" disabled={submitting} className="btn btn-primary min-h-11">
          {submitting ? 'Sending…' : 'Send link'}
        </button>
      </form>
      <p className="mt-6 text-sm">
        <button type="button" className="text-link" onClick={onPassword}>
          Use a password instead
        </button>
        {' · '}
        <button type="button" className="text-link" onClick={onBack}>
          Back
        </button>
      </p>
    </div>
  )
}

function PasswordAuth({
  onBack,
  onMagic,
  onReset,
}: {
  onBack: () => void
  onMagic: () => void
  onReset: () => void
}) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isSignUp = mode === 'sign-up'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) {
          setError(error.message)
          return
        }
        if (!data.session) {
          setInfo(
            'Check your email to confirm this account before the password sign-in works. A magic link is quicker if you want a session in one sitting.',
          )
        }
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandHeading />
      <header className="masthead mb-8">
        <p className="masthead-eyebrow">{isSignUp ? 'New space' : 'Password'}</p>
        <h1 className="masthead-title">{isSignUp ? 'Create your space' : 'Sign in with a password'}</h1>
      </header>
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
            className="input-field"
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
            className="input-field"
          />
        </label>
        {error ? <ErrorBanner message={error} /> : null}
        {info ? (
          <p className="text-sm text-[var(--text)]" role="status">
            {info}
          </p>
        ) : null}
        <button type="submit" disabled={submitting} className="btn btn-primary min-h-11">
          {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 flex flex-col items-start gap-2 text-sm">
        {!isSignUp ? (
          <button type="button" className="text-link" onClick={onReset}>
            Forgot password
          </button>
        ) : null}
        <button
          type="button"
          className="text-link"
          onClick={() => {
            setMode(isSignUp ? 'sign-in' : 'sign-up')
            setError(null)
            setInfo(null)
          }}
        >
          {isSignUp ? 'Have a password already? Sign in' : 'Need an account? Create one'}
        </button>
        <button type="button" className="text-link" onClick={onMagic}>
          Email me a link instead
        </button>
        <button type="button" className="text-link" onClick={onBack}>
          Back
        </button>
      </p>
    </div>
  )
}

function RequestReset({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setInfo('Check your email for a reset link. It brings you back here to choose a new password.')
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-12">
      <BrandHeading />
      <header className="masthead mb-8">
        <p className="masthead-eyebrow">Password</p>
        <h1 className="masthead-title">Reset your password</h1>
      </header>
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
            className="input-field"
          />
        </label>
        {error ? <ErrorBanner message={error} /> : null}
        {info ? (
          <p className="text-sm text-[var(--text)]" role="status">
            {info}
          </p>
        ) : null}
        <button type="submit" disabled={submitting} className="btn btn-primary min-h-11">
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-6 text-sm">
        <button type="button" className="text-link" onClick={onBack}>
          Back
        </button>
      </p>
    </div>
  )
}

export function ResetPassword({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onComplete()
  }

  return (
    <main className="auth-page">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-6 py-12">
        <BrandHeading />
        <header className="masthead mb-8">
          <p className="masthead-eyebrow">Password</p>
          <h1 className="masthead-title">Choose a new password</h1>
        </header>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            New password
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input-field"
            />
          </label>
          {error ? <ErrorBanner message={error} /> : null}
          <button type="submit" disabled={submitting} className="btn btn-primary min-h-11">
            {submitting ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </div>
    </main>
  )
}
