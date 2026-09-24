import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { consumeMcpRate } from '../../../src/lib/mcpRate.ts'
import { hashMcpToken, isMcpToken } from '../../../src/lib/mcpToken.ts'
import { oauthAction } from '../../../src/lib/mcpOauth.ts'
import { signUserJwt } from '../../../src/lib/userJwt.ts'
import { callMcpTool, mcpToolDefinitions } from '../../../src/mcp/tools.ts'
import type { Database } from '../../../src/types/database.ts'
import { approve, describeClient, discoveryResponse, registerClient, token as oauthToken, unauthorized } from './oauth.ts'

type RpcRequest = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: { name?: string; arguments?: unknown; protocolVersion?: string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('Origin')) })
  }
  const action = oauthAction(new URL(req.url))
  if (action !== 'rpc') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return jsonResponse(503, { error: 'Assistant access is not configured yet.' }, req)
    const admin = createClient<Database>(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    if (action === 'resource' || action === 'as') return discoveryResponse(req, action)
    if (req.method !== 'POST' && action !== 'client') return jsonResponse(405, { error: 'Method not allowed' }, req)
    if (action === 'register') return registerClient(req, admin)
    if (action === 'token') return oauthToken(req, admin)
    if (action === 'client') return describeClient(req, admin)
    return approve(req, admin)
  }

  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' }, req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const jwtSecret = Deno.env.get('REACH_JWT_SECRET')
  if (!supabaseUrl || !anonKey || !serviceKey || !jwtSecret) {
    return jsonResponse(503, { error: 'Assistant access is not configured yet.' }, req)
  }

  const token = bearer(req)
  if (!token || !isMcpToken(token)) return unauthorized(req, 'Missing assistant token')

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const tokenHash = await hashMcpToken(token)
  let found = await admin
    .from('mcp_tokens')
    .select('id, user_id, revoked_at, window_started_at, window_count, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (found.error && found.error.message.toLowerCase().includes('expires_at')) {
    found = await admin
      .from('mcp_tokens')
      .select('id, user_id, revoked_at, window_started_at, window_count')
      .eq('token_hash', tokenHash)
      .maybeSingle()
  }

  if (found.error) {
    console.error(JSON.stringify({ event: 'mcp_token_lookup_failed', message: found.error.message }))
    return jsonResponse(500, { error: 'Could not check that token' }, req)
  }
  if (!found.data || found.data.revoked_at) return unauthorized(req, 'Token revoked or unknown')
  if (found.data.expires_at && Date.parse(found.data.expires_at) <= Date.now()) {
    return unauthorized(req, 'Token expired')
  }

  const rate = consumeMcpRate({
    now: Date.now(),
    windowStartedAt: found.data.window_started_at,
    windowCount: found.data.window_count ?? 0,
  })
  if (!rate.allowed) {
    return jsonResponse(429, { error: 'Too many requests. Try again shortly.', retryAfterSeconds: rate.retryAfterSeconds }, req)
  }

  const stamped = await admin
    .from('mcp_tokens')
    .update({
      last_used_at: new Date().toISOString(),
      window_started_at: rate.windowStartedAt,
      window_count: rate.windowCount,
    })
    .eq('id', found.data.id)
  if (stamped.error) {
    console.error(JSON.stringify({ event: 'mcp_rate_stamp_failed', message: stamped.error.message }))
  }

  const profile = await admin.from('users').select('email').eq('id', found.data.user_id).maybeSingle()
  const jwt = await signUserJwt(jwtSecret, {
    userId: found.data.user_id,
    issuer: `${supabaseUrl}/auth/v1`,
    email: profile.data?.email ?? '',
  })
  const db = createClient<Database>(supabaseUrl, anonKey, {
    accessToken: async () => jwt,
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const body = await readBody(req)
  if (!body) return jsonResponse(400, { error: 'Expected a JSON-RPC request' }, req)
  if (body.id == null || String(body.method ?? '').startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: corsHeaders(req.headers.get('Origin')) })
  }

  try {
    const result = await dispatch(db, found.data.user_id, body)
    console.log(JSON.stringify({ event: 'mcp_call', userId: found.data.user_id, method: body.method }))
    return jsonResponse(200, { jsonrpc: '2.0', id: body.id, result }, req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed'
    console.error(
      JSON.stringify({
        event: 'mcp_call_failed',
        userId: found.data.user_id,
        method: body.method,
        tool: body.params?.name,
        message,
        stack: error instanceof Error ? error.stack : undefined,
      }),
    )
    return jsonResponse(200, { jsonrpc: '2.0', id: body.id, error: { code: -32000, message } }, req)
  }
})

function bearer(req: Request) {
  const header = req.headers.get('Authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  return match?.[1] ?? ''
}

async function readBody(req: Request): Promise<RpcRequest | null> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null
    return body as RpcRequest
  } catch {
    return null
  }
}

async function dispatch(db: ReturnType<typeof createClient<Database>>, userId: string, body: RpcRequest) {
  const method = body.method ?? ''
  if (method === 'initialize') {
    const requested = body.params?.protocolVersion
    const protocolVersion = requested === '2024-11-05' ? '2024-11-05' : '2025-03-26'
    return {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'reach', version: '1.0.0' },
    }
  }
  if (method === 'ping') return {}
  if (method === 'tools/list') return { tools: mcpToolDefinitions() }
  if (method === 'tools/call') {
    const name = body.params?.name ?? ''
    const result = await callMcpTool(db, userId, name, body.params?.arguments ?? {})
    return {
      content: [{ type: 'text', text: result.text }],
      isError: result.isError,
    }
  }
  throw new Error('Method not found')
}
