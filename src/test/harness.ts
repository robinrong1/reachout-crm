import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export type UserClient = SupabaseClient<Database>

export type TestUser = {
  id: string
  email: string
  password: string
  client: UserClient
}

function requiredEnv(name: string) {
  const value = import.meta.env[name] as string | undefined
  return value?.trim() || ''
}

export function integrationEnv() {
  return {
    url: requiredEnv('VITE_SUPABASE_URL'),
    anonKey: requiredEnv('VITE_SUPABASE_ANON_KEY'),
    serviceRoleKey: requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

export function hasIntegrationEnv() {
  const env = integrationEnv()
  return Boolean(env.url && env.anonKey && env.serviceRoleKey)
}

export function adminClient() {
  const { url, serviceRoleKey } = integrationEnv()
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient() {
  const { url, anonKey } = integrationEnv()
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Public sign-up path, then confirm via the service role if the project
 * requires email confirmation. Mirrors Auth.tsx + ensureUserProfile.
 */
export async function createTestUser(timezone = 'UTC'): Promise<TestUser> {
  const email = `crm-phase9-${crypto.randomUUID()}@example.com`
  const password = `Pw-${crypto.randomUUID()}-1`
  const client = anonClient()
  const admin = adminClient()

  const { data: signUpData, error: signUpError } = await client.auth.signUp({ email, password })

  let id = signUpData.user?.id
  let hasSession = Boolean(signUpData.session)

  if (signUpError || !id) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (created.error || !created.data.user) {
      throw signUpError ?? created.error ?? new Error('could not create test user')
    }
    id = created.data.user.id
    hasSession = false
  }

  if (!hasSession) {
    const { error: confirmError } = await admin.auth.admin.updateUserById(id, {
      email_confirm: true,
    })
    if (confirmError) throw confirmError

    const { error: signInError } = await client.auth.signInWithPassword({ email, password })
    if (signInError) throw signInError
  }

  const { error: profileError } = await client.from('users').upsert(
    { id, email, timezone },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (profileError) throw profileError

  return { id, email, password, client }
}

export async function deleteTestUser(id: string) {
  const { error } = await adminClient().auth.admin.deleteUser(id)
  if (error) throw error
}

export function utcToday() {
  return new Date().toISOString().slice(0, 10)
}
