import { supabase } from './supabase'
import { generateMcpToken, hashMcpToken, validateMcpLabel } from './mcpToken'

export type McpTokenRow = {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

const SCHEMA_MISSING = 'Assistant access is not set up on this database yet. Apply schema.sql in the Supabase SQL editor, then reload.'

function asError(error: { message: string; code?: string } | null) {
  if (!error) return null
  const message = error.message.toLowerCase()
  if (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    message.includes('schema cache') ||
    (message.includes('does not exist') && message.includes('mcp_tokens'))
  ) {
    return new Error(SCHEMA_MISSING)
  }
  return new Error(error.message)
}

export async function listMcpTokens() {
  const { data, error } = await supabase
    .from('mcp_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false })

  return { data: (data ?? null) as McpTokenRow[] | null, error: asError(error) }
}

export async function createMcpToken(label: string) {
  const labelError = validateMcpLabel(label)
  if (labelError) return { token: null, data: null, error: labelError }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return { token: null, data: null, error: userError ?? new Error('Not signed in') }

  const token = generateMcpToken()
  const tokenHash = await hashMcpToken(token)
  const { data, error } = await supabase
    .from('mcp_tokens')
    .insert({ user_id: userData.user.id, token_hash: tokenHash, label: label.trim() })
    .select('id, label, created_at, last_used_at, revoked_at')
    .single()

  return { token, data: (data ?? null) as McpTokenRow | null, error: asError(error) }
}

export async function revokeMcpToken(id: string) {
  const { error } = await supabase
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)

  return { error: asError(error) }
}
