import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navbar } from './components/Navbar'
import { supabase } from './lib/supabase'
import { ensureUserProfile } from './lib/users'
import { Auth } from './pages/Auth'
import { ContactDetail } from './pages/ContactDetail'
import { ContactList } from './pages/ContactList'
import { Dashboard } from './pages/Dashboard'
import { NewContact } from './pages/NewContact'

type Screen =
  | { name: 'dashboard' }
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; id: string; from: 'dashboard' | 'list' }

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>({ name: 'dashboard' })

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session)
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setScreen({ name: 'dashboard' })
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfileError(null)
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

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center px-6">
        <p>Loading session…</p>
      </main>
    )
  }

  if (!session) {
    return <Auth />
  }

  const navCurrent = screen.name === 'dashboard' || (screen.name === 'detail' && screen.from === 'dashboard')
    ? 'dashboard'
    : 'contacts'

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-6 py-10 text-left">
      <Navbar
        current={navCurrent}
        onDashboard={() => setScreen({ name: 'dashboard' })}
        onContacts={() => setScreen({ name: 'list' })}
        onSignOut={() => {
          void supabase.auth.signOut()
        }}
      />

      <p className="text-sm">
        Signed in as <strong>{session.user.email}</strong>
      </p>

      {profileError ? (
        <p className="text-sm text-red-600" role="alert">
          Could not create your profile: {profileError}. Apply the latest{' '}
          <code>schema.sql</code> (including users RLS) in Supabase, then sign out
          and sign in again.
        </p>
      ) : screen.name === 'new' ? (
        <NewContact
          onCancel={() => setScreen({ name: 'list' })}
          onCreated={(id) => setScreen({ name: 'detail', id, from: 'list' })}
        />
      ) : screen.name === 'detail' ? (
        <ContactDetail
          id={screen.id}
          onBack={() =>
            setScreen(screen.from === 'list' ? { name: 'list' } : { name: 'dashboard' })
          }
        />
      ) : screen.name === 'list' ? (
        <ContactList
          onNew={() => setScreen({ name: 'new' })}
          onOpen={(id) => setScreen({ name: 'detail', id, from: 'list' })}
        />
      ) : (
        <Dashboard onViewContact={(id) => setScreen({ name: 'detail', id, from: 'dashboard' })} />
      )}
    </main>
  )
}

export default App
