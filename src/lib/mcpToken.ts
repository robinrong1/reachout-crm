const TOKEN_PREFIX = 'reach_'

export function validateMcpLabel(label: string | undefined) {
  const trimmed = label?.trim() ?? ''
  if (!trimmed) return new Error('Name this connection')
  if (trimmed.length > 40) return new Error('Connection names must be 40 characters or fewer')
  return null
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function generateMcpToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `${TOKEN_PREFIX}${toBase64Url(bytes)}`
}

export async function hashMcpToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function isMcpToken(token: string) {
  return token.startsWith(TOKEN_PREFIX) && token.length > TOKEN_PREFIX.length && token.length <= 200
}
