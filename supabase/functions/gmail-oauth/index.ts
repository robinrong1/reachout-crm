import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { isAllowedGmailRedirect } from '../../../src/lib/gmailRedirect.ts'
import { encryptString } from '../../../src/lib/secretBox.ts'
import { readPayload, signPayload } from '../../../src/lib/signedState.ts'

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.metadata'
const STATE_TTL_MS = 15 * 60 * 1000

type GmailState = {
  userId: string
  origin: string
  exp: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('Origin')) })
  }
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, req)

  const configError = missingConfig()
  if (configError) return jsonResponse(503, { error: configError }, req)

  const user = await userFromRequest(req)
  if (!user) return jsonResponse(401, { error: 'Not signed in' }, req)

  const body = await readBody(req)
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : ''
  if (!isAllowedGmailRedirect(redirectUri, Deno.env.get('APP_ORIGIN'))) {
    return jsonResponse(400, { error: 'This site is not allowed to connect Gmail.' }, req)
  }

  if (typeof body.code === 'string') {
    return exchangeCode(req, user.id, body, redirectUri)
  }
  return startConnect(req, user.id, redirectUri)
})

function missingConfig() {
  if (!Deno.env.get('GOOGLE_CLIENT_ID') || !Deno.env.get('GOOGLE_CLIENT_SECRET')) {
    return 'Gmail import is not configured yet.'
  }
  if (!Deno.env.get('GMAIL_TOKEN_KEY')) return 'Gmail import is not configured yet.'
  if (!Deno.env.get('SUPABASE_URL') || !Deno.env.get('SUPABASE_ANON_KEY') || !Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
    return 'Gmail import is not configured yet.'
  }
  return null
}

async function userFromRequest(req: Request) {
  const header = req.headers.get('Authorization') ?? ''
  if (!header.toLowerCase().startsWith('bearer ')) return null
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return data.user
}

async function readBody(req: Request) {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function startConnect(req: Request, userId: string, redirectUri: string) {
  const origin = new URL(redirectUri).origin
  const state = await signPayload(Deno.env.get('GMAIL_TOKEN_KEY')!, {
    userId,
    origin,
    exp: Date.now() + STATE_TTL_MS,
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', Deno.env.get('GOOGLE_CLIENT_ID')!)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GMAIL_SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'false')
  url.searchParams.set('state', state)
  return jsonResponse(200, { url: url.toString() }, req)
}

async function exchangeCode(
  req: Request,
  userId: string,
  body: Record<string, unknown>,
  redirectUri: string,
) {
  const code = typeof body.code === 'string' ? body.code : ''
  const stateToken = typeof body.state === 'string' ? body.state : ''
  if (!code || code.length > 2048 || !stateToken || stateToken.length > 4096) {
    return jsonResponse(400, { error: 'Gmail did not return a usable code.' }, req)
  }

  const state = await readPayload<GmailState>(Deno.env.get('GMAIL_TOKEN_KEY')!, stateToken)
  const origin = new URL(redirectUri).origin
  if (!state || state.userId !== userId || state.origin !== origin) {
    return jsonResponse(400, { error: 'This Gmail connection link expired. Try again from Settings.' }, req)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenBody = await tokenRes.json().catch(() => ({}))
  const refreshToken = typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : ''
  if (!tokenRes.ok || !refreshToken) {
    console.error(JSON.stringify({ event: 'gmail_oauth_failed', userId, status: tokenRes.status }))
    return jsonResponse(400, { error: 'Gmail did not grant offline access. Try connecting again.' }, req)
  }

  const encrypted = await encryptString(refreshToken, Deno.env.get('GMAIL_TOKEN_KEY')!)
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await admin.from('google_connections').upsert(
    {
      user_id: userId,
      refresh_token_enc: encrypted,
      scopes: GMAIL_SCOPE,
      connected_at: new Date().toISOString(),
      last_synced_at: null,
    },
    { onConflict: 'user_id' },
  )
  if (error) {
    console.error(JSON.stringify({ event: 'gmail_oauth_store_failed', userId, message: error.message }))
    return jsonResponse(500, { error: 'Could not save the Gmail connection.' }, req)
  }

  console.log(JSON.stringify({ event: 'gmail_connected', userId }))
  return jsonResponse(200, { ok: true }, req)
}
