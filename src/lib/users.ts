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

export type UserProfile = {
  id: string
  email: string
  timezone: string | null
  digest_day_of_week: number | null
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export function isValidTimeZone(zone: string) {
  const trimmed = zone.trim()
  if (!trimmed) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed })
    return true
  } catch {
    return false
  }
}

export async function getUserProfile() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError) return { profile: null as UserProfile | null, error: sessionError }
  if (!sessionData.user) return { profile: null as UserProfile | null, error: new Error('Not signed in') }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, timezone, digest_day_of_week')
    .eq('id', sessionData.user.id)
    .maybeSingle()

  return { profile: (data ?? null) as UserProfile | null, error }
}

export async function updateUserProfile(input: { timezone: string; digest_day_of_week: number }) {
  const zone = input.timezone.trim()
  if (!isValidTimeZone(zone)) {
    return { error: new Error('Timezone must be an IANA name, like America/Toronto') }
  }
  if (!Number.isInteger(input.digest_day_of_week) || input.digest_day_of_week < 0 || input.digest_day_of_week > 6) {
    return { error: new Error('Pick a day of the week for the digest') }
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  if (sessionError) return { error: sessionError }
  if (!sessionData.user) return { error: new Error('Not signed in') }

  const { error } = await supabase
    .from('users')
    .update({
      timezone: zone,
      digest_day_of_week: input.digest_day_of_week,
    })
    .eq('id', sessionData.user.id)

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
