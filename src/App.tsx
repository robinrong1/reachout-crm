import { useEffect, useState } from 'react'
import { BrowserRouter, matchPath, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import type { Session } from '@supabase/supabase-js'
import { BrandHeading, BrandMark } from './components/BrandMark'
import { ErrorBanner } from './components/ErrorBanner'
import { NavSnackbar } from './components/NavSnackbar'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { countContacts } from './lib/contacts'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { ensureUserProfile } from './lib/users'
import { Auth, ResetPassword } from './pages/Auth'
import { ContactDetail } from './pages/ContactDetail'
import { ContactList } from './pages/ContactList'
import { Dashboard } from './pages/Dashboard'
import { GmailCallback } from './pages/GmailCallback'
import { McpAuthorize } from './pages/McpAuthorize'
import { GmailReview } from './pages/GmailReview'
import { Home } from './pages/Home'
import { NewContact } from './pages/NewContact'
import { NotFound } from './pages/NotFound'
import { Settings } from './pages/Settings'
import { Timeline } from './pages/Timeline'
import { Welcome, welcomeWasSkipped } from './pages/Welcome'

// Must list every path in <Routes> below; signed-out visitors never reach the router.
const APP_PATHS = [
  '/',
  '/home',
  '/welcome',
  '/settings',
  '/oauth/authorize',
  '/import/gmail/callback',
  '/import/gmail',
  '/keep-in-touch',
  '/contacts',
  '/contacts/new',
  '/contacts/:id',
  '/timeline',
]

function isKnownPath(pathname: string) {
  return APP_PATHS.some((path) => matchPath(path, pathname))
}

function navCurrent(pathname: string) {
  if (pathname.startsWith('/settings') || pathname.startsWith('/import')) return 'settings' as const
  if (pathname === '/' || pathname === '/home' || pathname.startsWith('/welcome')) return 'home' as const
  if (pathname.startsWith('/contacts')) return 'contacts' as const
  if (pathname.startsWith('/timeline')) return 'timeline' as const
  if (pathname.startsWith('/keep-in-touch')) return 'keep-in-touch' as const
  return 'home' as const
}

function AppShell({
  email,
  profileError,
  onSignOut,
}: {
  email?: string | null
  profileError: string | null
  onSignOut: () => void
}) {
  const location = useLocation()
  const current = navCurrent(location.pathname)

  return (
    <div className="flex min-h-svh bg-[var(--paper)] text-left">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar current={current} email={email} onSignOut={onSignOut} />
      <div className="flex min-w-0 flex-1 flex-col paper-canvas">
        <TopBar compact={current === 'timeline'} />
        <main id="main-content" className="paper-main" tabIndex={-1}>
          {profileError ? (
            <div className="mb-6">
              <ErrorBanner
                message={`Could not create your profile: ${profileError}. Apply the latest schema.sql (including users RLS) in Supabase, then sign out and sign in again.`}
              />
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
      <NavSnackbar current={current} />
    </div>
  )
}

function HomeGate() {
  const [gate, setGate] = useState<'loading' | 'home' | 'welcome'>(() =>
    welcomeWasSkipped() ? 'home' : 'loading',
  )

  useEffect(() => {
    if (welcomeWasSkipped()) return
    let cancelled = false
    void countContacts().then(({ count, error }) => {
      if (cancelled) return
      if (error || count > 0) setGate('home')
      else setGate('welcome')
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (gate === 'loading') {
    return (
      <p role="status" aria-busy="true">
        Loading…
      </p>
    )
  }
  if (gate === 'welcome') return <Navigate to="/welcome" replace />
  return <Home />
}

function KeepInTouch() {
  const navigate = useNavigate()
  return (
    <Dashboard
      onViewContact={(id) => navigate(`/contacts/${id}`, { state: { from: '/keep-in-touch' } })}
    />
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [needsNewPassword, setNeedsNewPassword] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setSessionError(error.message)
          setSession(null)
        } else {
          setSession(data.session)
        }
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSessionError(error instanceof Error ? error.message : 'Could not load session')
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setSessionError(null)
      if (event === 'PASSWORD_RECOVERY') setNeedsNewPassword(true)
      if (!nextSession) {
        setProfileError(null)
        setNeedsNewPassword(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      return
    }

    let cancelled = false

    ensureUserProfile(session.user).then(({ error }) => {
      if (!cancelled) {
        setProfileError(error?.message ?? null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [session])

  if (!isKnownPath(window.location.pathname)) {
    return <NotFound />
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12">
        <BrandHeading />
        <ErrorBanner message="Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and restart the dev server." />
      </main>
    )
  }

  if (loading) {
    return (
      <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4" aria-busy="true">
        <BrandMark className="h-12 w-12" label="Reach" />
        <p role="status">Loading…</p>
      </main>
    )
  }

  if (sessionError && !session) {
    return (
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center px-4 py-12">
        <BrandHeading />
        <ErrorBanner
          message={sessionError}
          onRetry={() => {
            window.location.reload()
          }}
        />
      </main>
    )
  }

  if (!session) {
    return <Auth />
  }

  if (needsNewPassword) {
    return <ResetPassword onComplete={() => setNeedsNewPassword(false)} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          element={
            <AppShell
              email={session.user.email}
              profileError={profileError}
              onSignOut={() => {
                void supabase.auth.signOut()
              }}
            />
          }
        >
          <Route path="/" element={<HomeGate />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/oauth/authorize" element={<McpAuthorize />} />
          <Route path="/import/gmail/callback" element={<GmailCallback />} />
          <Route path="/import/gmail" element={<GmailReview />} />
          <Route path="/keep-in-touch" element={<KeepInTouch />} />
          <Route path="/contacts" element={<ContactList />} />
          <Route path="/contacts/new" element={<NewContact />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/timeline" element={<Timeline />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
