import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { generateMcpToken, hashMcpToken } from '../../../src/lib/mcpToken.ts'
import {
  OAUTH_ACCESS_TTL_SECONDS,
  OAUTH_CODE_TTL_MS,
  OAUTH_REFRESH_TTL_MS,
  acceptedResources,
  authorizationRedirect,
  authorizationServerMetadata,
  isAllowedRedirectUri,
  pkceMatches,
  protectedResourceMetadata,
  randomId,
  resolvePublicOrigin,
  resourceMatches,
  validateRegistration,
  wwwAuthenticate,
} from '../../../src/lib/mcpOauth.ts'
import type { Database } from '../../../src/types/database.ts'

type Admin = SupabaseClient<Database>

export function publicOriginFrom(req: Request) {
  return resolvePublicOrigin(Deno.env.get('APP_ORIGIN'), req.headers.get('x-reach-public-origin'))
}

export function functionUrl() {
  return `${Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '')}/functions/v1/mcp`
}

export function unauthorized(req: Request, message: string) {
  const origin = publicOriginFrom(req)
  const headers: Record<string, string> = {
    ...corsHeaders(req.headers.get('Origin')),
    'Content-Type': 'application/json',
  }
  if (origin) headers['WWW-Authenticate'] = wwwAuthenticate(origin)
  return new Response(JSON.stringify({ error: message }), { status: 401, headers })
}

export function discoveryResponse(req: Request, kind: 'resource' | 'as') {
  const origin = publicOriginFrom(req)
  if (!origin) {
    return jsonResponse(503, { error: 'Set APP_ORIGIN so browser sign-in knows which site to open.' }, req)
  }
  const body =
    kind === 'as'
      ? authorizationServerMetadata(origin, functionUrl())
      : protectedResourceMetadata(origin, functionUrl())
  return jsonResponse(200, body, req)
}

export async function registerClient(req: Request, admin: Admin) {
  const body = await readJson(req)
  const registration = validateRegistration(body)
  if (registration.error || !registration.clientName || !registration.redirectUris) {
    return jsonResponse(400, { error: 'invalid_client_metadata', error_description: registration.error }, req)
  }
  const clientId = randomId('reach_client_')
  const inserted = await admin.from('mcp_oauth_clients').insert({
    client_id: clientId,
    client_name: registration.clientName,
    redirect_uris: registration.redirectUris,
  })
  if (inserted.error) {
    console.error(JSON.stringify({ event: 'mcp_oauth_register_failed', message: inserted.error.message }))
    return jsonResponse(500, { error: 'Could not register that client' }, req)
  }
  return jsonResponse(
    201,
    {
      client_id: clientId,
      client_name: registration.clientName,
      redirect_uris: registration.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    req,
  )
}

export async function describeClient(req: Request, admin: Admin) {
  const clientId = new URL(req.url).searchParams.get('client_id') ?? ''
  const client = await loadClient(admin, clientId)
  if (!client) return jsonResponse(404, { error: 'Unknown client' }, req)
  return jsonResponse(200, { client_id: client.client_id, client_name: client.client_name }, req)
}

export async function approve(req: Request, admin: Admin) {
  const user = await userFromRequest(req)
  if (!user) return jsonResponse(401, { error: 'Not signed in' }, req)
  const body = await readJson(req)
  const clientId = asString(body.client_id)
  const redirectUri = asString(body.redirect_uri)
  const challenge = asString(body.code_challenge)
  const method = asString(body.code_challenge_method) || 'S256'
  const state = asString(body.state) ?? ''
  const resource = asString(body.resource)
  const decision = asString(body.decision)

  const client = clientId ? await loadClient(admin, clientId) : null
  if (!client || !redirectUri || !client.redirect_uris.includes(redirectUri) || !isAllowedRedirectUri(redirectUri)) {
    return jsonResponse(400, { error: 'This app is not allowed to return to that address.' }, req)
  }

  if (decision === 'deny') {
    return jsonResponse(200, { redirect: authorizationRedirect(redirectUri, { error: 'access_denied', state }) }, req)
  }

  if (method !== 'S256' || !challenge) {
    return jsonResponse(400, { error: 'Browser sign-in requires a PKCE S256 challenge.' }, req)
  }
  const origin = publicOriginFrom(req)
  if (!resourceMatches(resource, acceptedResources(origin, functionUrl()))) {
    return jsonResponse(400, { error: 'That request is for a different server.' }, req)
  }

  const code = randomId('oc_')
  const codeHash = await hashMcpToken(code)
  const inserted = await admin.from('mcp_oauth_codes').insert({
    code_hash: codeHash,
    user_id: user.id,
    client_id: client.client_id,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    resource: resource ?? null,
    expires_at: new Date(Date.now() + OAUTH_CODE_TTL_MS).toISOString(),
  })
  if (inserted.error) {
    console.error(JSON.stringify({ event: 'mcp_oauth_code_failed', message: inserted.error.message }))
    return jsonResponse(500, { error: 'Could not start browser sign-in' }, req)
  }

  const params: Record<string, string> = { code }
  if (state) params.state = state
  return jsonResponse(200, { redirect: authorizationRedirect(redirectUri, params) }, req)
}

export async function token(req: Request, admin: Admin) {
  const body = await readForm(req)
  const grant = body.grant_type ?? ''
  if (grant === 'authorization_code') return exchangeCode(req, admin, body)
  if (grant === 'refresh_token') return exchangeRefresh(req, admin, body)
  return jsonResponse(400, { error: 'unsupported_grant_type' }, req)
}

async function exchangeCode(req: Request, admin: Admin, body: Record<string, string>) {
  const code = body.code ?? ''
  const verifier = body.code_verifier ?? ''
  const clientId = body.client_id ?? ''
  const redirectUri = body.redirect_uri ?? ''
  if (!code || !verifier || !clientId || !redirectUri) {
    return jsonResponse(400, { error: 'invalid_request' }, req)
  }

  const codeHash = await hashMcpToken(code)
  const found = await admin.from('mcp_oauth_codes').select('*').eq('code_hash', codeHash).maybeSingle()
  const row = found.data
  if (found.error || !row || row.used_at || row.client_id !== clientId || row.redirect_uri !== redirectUri) {
    return jsonResponse(400, { error: 'invalid_grant' }, req)
  }
  if (Date.parse(row.expires_at) <= Date.now()) return jsonResponse(400, { error: 'invalid_grant' }, req)
  if (!(await pkceMatches(verifier, row.code_challenge))) return jsonResponse(400, { error: 'invalid_grant' }, req)
  const origin = publicOriginFrom(req)
  if (!resourceMatches(body.resource, acceptedResources(origin, functionUrl()))) {
    return jsonResponse(400, { error: 'invalid_target' }, req)
  }

  const consumed = await admin
    .from('mcp_oauth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .select('code_hash')
  if (consumed.error || !consumed.data?.length) return jsonResponse(400, { error: 'invalid_grant' }, req)

  const client = await loadClient(admin, clientId)
  if (!client) return jsonResponse(400, { error: 'invalid_client' }, req)
  return issueTokens(req, admin, row.user_id, client.client_id, client.client_name)
}

async function exchangeRefresh(req: Request, admin: Admin, body: Record<string, string>) {
  const refresh = body.refresh_token ?? ''
  const clientId = body.client_id ?? ''
  if (!refresh || !clientId) return jsonResponse(400, { error: 'invalid_request' }, req)
  const tokenHash = await hashMcpToken(refresh)
  const found = await admin.from('mcp_oauth_refresh').select('*').eq('token_hash', tokenHash).maybeSingle()
  const row = found.data
  if (found.error || !row || row.client_id !== clientId) return jsonResponse(400, { error: 'invalid_grant' }, req)
  if (row.revoked_at || row.replaced_at || Date.parse(row.expires_at) <= Date.now()) {
    await admin
      .from('mcp_oauth_refresh')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', row.user_id)
      .eq('client_id', row.client_id)
    await admin.from('mcp_tokens').update({ revoked_at: new Date().toISOString() }).eq('user_id', row.user_id).eq('client_id', row.client_id)
    return jsonResponse(400, { error: 'invalid_grant' }, req)
  }

  const rotated = await admin
    .from('mcp_oauth_refresh')
    .update({ replaced_at: new Date().toISOString() })
    .eq('token_hash', tokenHash)
    .is('replaced_at', null)
    .is('revoked_at', null)
    .select('token_hash')
  if (rotated.error || !rotated.data?.length) return jsonResponse(400, { error: 'invalid_grant' }, req)

  const client = await loadClient(admin, clientId)
  if (!client) return jsonResponse(400, { error: 'invalid_client' }, req)
  return issueTokens(req, admin, row.user_id, client.client_id, client.client_name)
}

async function issueTokens(req: Request, admin: Admin, userId: string, clientId: string, clientName: string) {
  const access = generateMcpToken()
  const refresh = randomId('rf_')
  const accessHash = await hashMcpToken(access)
  const refreshHash = await hashMcpToken(refresh)
  const accessRow = await admin.from('mcp_tokens').insert({
    user_id: userId,
    token_hash: accessHash,
    label: clientName,
    client_id: clientId,
    expires_at: new Date(Date.now() + OAUTH_ACCESS_TTL_SECONDS * 1000).toISOString(),
  })
  if (accessRow.error) {
    console.error(JSON.stringify({ event: 'mcp_oauth_access_failed', message: accessRow.error.message }))
    return jsonResponse(500, { error: 'server_error' }, req)
  }
  const refreshRow = await admin.from('mcp_oauth_refresh').insert({
    token_hash: refreshHash,
    user_id: userId,
    client_id: clientId,
    expires_at: new Date(Date.now() + OAUTH_REFRESH_TTL_MS).toISOString(),
  })
  if (refreshRow.error) {
    console.error(JSON.stringify({ event: 'mcp_oauth_refresh_failed', message: refreshRow.error.message }))
    return jsonResponse(500, { error: 'server_error' }, req)
  }
  return jsonResponse(
    200,
    {
      access_token: access,
      token_type: 'Bearer',
      expires_in: OAUTH_ACCESS_TTL_SECONDS,
      refresh_token: refresh,
      scope: 'mcp',
    },
    req,
  )
}

async function loadClient(admin: Admin, clientId: string) {
  const found = await admin.from('mcp_oauth_clients').select('client_id, client_name, redirect_uris').eq('client_id', clientId).maybeSingle()
  if (found.error || !found.data) return null
  const uris = found.data.redirect_uris
  return {
    client_id: found.data.client_id,
    client_name: found.data.client_name,
    redirect_uris: Array.isArray(uris) ? uris.filter((uri): uri is string => typeof uri === 'string') : [],
  }
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

async function readJson(req: Request) {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function readForm(req: Request) {
  const type = req.headers.get('Content-Type') ?? ''
  if (type.includes('application/json')) {
    const json = await readJson(req)
    const fields: Record<string, string> = {}
    for (const [key, value] of Object.entries(json)) {
      if (typeof value === 'string') fields[key] = value
    }
    return fields
  }
  const text = await req.text()
  const params = new URLSearchParams(text)
  return Object.fromEntries(params.entries())
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}
