import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { decryptString } from '../../../src/lib/secretBox.ts'

const SENT_CAP = 300
const FETCH_CONCURRENCY = 5
const METADATA_HEADERS = ['From', 'To', 'Cc', 'Date', 'List-Unsubscribe']

type HeaderMessage = {
  from: string
  to: string
  cc: string
  date: string
  listUnsubscribe: boolean
  sent: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('Origin')) })
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const tokenKey = Deno.env.get('GMAIL_TOKEN_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey || !clientId || !clientSecret || !tokenKey) {
    return jsonResponse(503, { error: 'Gmail import is not configured yet.' }, req)
  }

  const header = req.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return jsonResponse(401, { error: 'Not signed in' }, req)
  const userId = userData.user.id

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const connection = await admin
    .from('google_connections')
    .select('refresh_token_enc')
    .eq('user_id', userId)
    .maybeSingle()
  if (connection.error) {
    console.error(JSON.stringify({ event: 'gmail_import_failed', userId, message: connection.error.message }))
    return jsonResponse(500, { error: 'Could not read the Gmail connection.' }, req)
  }
  if (!connection.data?.refresh_token_enc) {
    return jsonResponse(409, { error: 'Connect Gmail first.', code: 'not_connected' }, req)
  }

  let refreshToken = ''
  try {
    refreshToken = await decryptString(connection.data.refresh_token_enc, tokenKey)
  } catch {
    return jsonResponse(500, { error: 'The saved Gmail connection could not be read. Disconnect and connect again.' }, req)
  }

  const access = await refreshAccessToken(refreshToken, clientId, clientSecret)
  if (!access.token) {
    console.error(JSON.stringify({ event: 'gmail_refresh_failed', userId, status: access.status }))
    return jsonResponse(401, {
      error: 'Gmail access expired. Disconnect and connect again.',
      code: 'reconnect',
    }, req)
  }

  try {
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${access.token}` },
    })
    const profile = await profileRes.json().catch(() => ({}))
    const ownerEmail = typeof profile.emailAddress === 'string' ? profile.emailAddress : ''
    if (!profileRes.ok || !ownerEmail) {
      return jsonResponse(502, { error: 'Could not read the Gmail account address.' }, req)
    }

    // Replies are often archived or older than the newest inbox mail, so read whole
    // conversations the user wrote in rather than the inbox.
    const threadIds = await listSentThreadIds(access.token, SENT_CAP)
    const threads = await mapPool(threadIds, FETCH_CONCURRENCY, (id) => fetchThread(access.token, id))
    const failed = threads.filter((thread) => thread === null).length
    if (threadIds.length > 0 && failed === threadIds.length) {
      throw new Error('every thread request failed')
    }
    const messages = threads.flatMap((thread) => thread ?? [])

    const synced = await admin
      .from('google_connections')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (synced.error) {
      console.error(JSON.stringify({ event: 'gmail_sync_stamp_failed', userId, message: synced.error.message }))
    }

    console.log(
      JSON.stringify({
        event: 'gmail_import_finished',
        userId,
        threads: threadIds.length,
        failedThreads: failed,
        messages: messages.length,
      }),
    )
    return jsonResponse(200, { ownerEmail, messages }, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gmail request failed'
    console.error(JSON.stringify({ event: 'gmail_import_failed', userId, message }))
    return jsonResponse(502, { error: 'Could not read email headers. Try again.' }, req)
  }
})

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  const body = await res.json().catch(() => ({}))
  const token = typeof body.access_token === 'string' ? body.access_token : ''
  return { token, status: res.status }
}

async function gmailGet(url: URL, accessToken: string) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const retryable = res.status === 429 || res.status >= 500
    if (!retryable || attempt >= 3) return res
    await res.body?.cancel()
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
  }
}

async function listSentThreadIds(accessToken: string, cap: number) {
  const threadIds = new Set<string>()
  let seen = 0
  let pageToken = ''
  while (seen < cap) {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.set('labelIds', 'SENT')
    url.searchParams.set('maxResults', String(Math.min(100, cap - seen)))
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await gmailGet(url, accessToken)
    if (!res.ok) throw new Error(`gmail list ${res.status}`)
    const body = await res.json()
    for (const message of body.messages ?? []) {
      seen += 1
      if (typeof message.threadId === 'string') threadIds.add(message.threadId)
    }
    pageToken = typeof body.nextPageToken === 'string' ? body.nextPageToken : ''
    if (!pageToken) break
  }
  return [...threadIds]
}

async function fetchThread(accessToken: string, id: string): Promise<HeaderMessage[] | null> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}`)
  url.searchParams.set('format', 'metadata')
  for (const name of METADATA_HEADERS) url.searchParams.append('metadataHeaders', name)
  const res = await gmailGet(url, accessToken)
  if (!res.ok) {
    await res.body?.cancel()
    return null
  }
  const body = await res.json()
  const messages = Array.isArray(body.messages) ? body.messages : []
  return messages.map((message: { labelIds?: string[]; payload?: { headers?: unknown } }) => {
    const headers = Array.isArray(message.payload?.headers) ? message.payload.headers : []
    const value = (name: string) => {
      const found = headers.find(
        (header: { name?: string; value?: string }) => header.name?.toLowerCase() === name.toLowerCase(),
      )
      return typeof found?.value === 'string' ? found.value : ''
    }
    return {
      from: value('From'),
      to: value('To'),
      cc: value('Cc'),
      date: value('Date'),
      listUnsubscribe: value('List-Unsubscribe').length > 0,
      sent: Array.isArray(message.labelIds) && message.labelIds.includes('SENT'),
    }
  })
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index])
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
