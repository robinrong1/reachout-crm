import { suggestGmailContacts, type GmailHeaderMessage, type GmailSuggestion } from './gmail-import'
import { gmailCallbackUri } from './gmailRedirect'
import { supabase, supabaseAnonKey, supabaseUrl } from './supabase'

export type GmailConnectionStatus = {
  id: string
  scopes: string
  connected_at: string
  last_synced_at: string | null
}

const SCHEMA_MISSING = 'Gmail import is not set up on this database yet. Apply schema.sql in the Supabase SQL editor, then reload.'

function asError(error: { message: string; code?: string } | null) {
  if (!error) return null
  const message = error.message.toLowerCase()
  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes('schema cache') ||
    (message.includes('does not exist') && message.includes('google_connections'))
  ) {
    return new Error(SCHEMA_MISSING)
  }
  return new Error(error.message)
}

async function functionPost(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, body: { error: 'Not signed in' } }

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch {
    return {
      ok: false,
      body: { error: 'Gmail connect is not available yet. Deploy the gmail-oauth function, then try again.' },
    }
  }
  const payload = (await response.json().catch(() => ({ error: 'Unexpected response from Gmail import' }))) as {
    error?: string
    code?: string
    url?: string
    ok?: boolean
    ownerEmail?: string
    messages?: GmailHeaderMessage[]
  }
  return { ok: response.ok, body: payload }
}

export async function getGmailConnection() {
  const { data, error } = await supabase
    .from('google_connections')
    .select('id, scopes, connected_at, last_synced_at')
    .maybeSingle()

  return {
    data: (data ?? null) as GmailConnectionStatus | null,
    error: asError(error),
  }
}

export async function disconnectGmail() {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return { error: userError ?? new Error('Not signed in') }

  const { error } = await supabase.from('google_connections').delete().eq('user_id', userData.user.id)
  return { error: asError(error) }
}

export async function startGmailConnect() {
  const result = await functionPost('gmail-oauth', { redirectUri: gmailCallbackUri(window.location.origin) })
  if (!result.ok || typeof result.body.url !== 'string') {
    return { error: new Error(result.body.error ?? 'Could not start Gmail connect') }
  }
  window.location.assign(result.body.url)
  return { error: null }
}

export async function completeGmailConnect(code: string, state: string) {
  const result = await functionPost('gmail-oauth', {
    code,
    state,
    redirectUri: gmailCallbackUri(window.location.origin),
  })
  if (!result.ok) return { error: new Error(result.body.error ?? 'Could not connect Gmail') }
  return { error: null }
}

export async function loadGmailSuggestions(excludeEmails: string[]) {
  const result = await functionPost('gmail-import', {})
  if (!result.ok || !result.body.ownerEmail || !Array.isArray(result.body.messages)) {
    return {
      data: null as GmailSuggestion[] | null,
      error: new Error(result.body.error ?? 'Could not read Gmail headers'),
      code: result.body.code ?? null,
    }
  }

  return {
    data: suggestGmailContacts(result.body.messages, {
      ownerEmail: result.body.ownerEmail,
      excludeEmails,
    }),
    error: null,
    code: null,
  }
}
