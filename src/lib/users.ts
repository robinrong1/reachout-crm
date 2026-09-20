import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * Creates the public.users row that contacts.user_id foreign-keys to.
 * Called whenever a session exists so it works both when sign-up returns
 * a session immediately and when the user first signs in after confirming
 * their email. ignoreDuplicates keeps a later sign-in from overwriting
 * timezone / digest preferences.
 */
export async function ensureUserProfile(user: User) {
  if (!user.email) {
    return { error: new Error('Signed-in user has no email') }
  }

  const { error } = await supabase.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )

  return { error }
}

export async function getUserTimezone() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError) return { timezone: 'UTC', error: sessionError }
  if (!sessionData.user) return { timezone: 'UTC', error: new Error('Not signed in') }

  const { data, error } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', sessionData.user.id)
    .maybeSingle()

  return { timezone: data?.timezone || 'UTC', error }
}
