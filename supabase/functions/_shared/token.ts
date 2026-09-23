export type ReachOutPayload = {
  userId: string
  contactId: string
  exp: number
  action?: 'snooze'
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signBytes(secret: string, data: string) {
  const key = await importKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return toBase64Url(new Uint8Array(signature))
}

export async function signReachOutToken(secret: string, payload: ReachOutPayload) {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await signBytes(secret, body)
  return `${body}.${signature}`
}

export async function verifyReachOutToken(secret: string, token: string): Promise<ReachOutPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [body, signature] = parts
  const expected = await signBytes(secret, body)
  if (expected !== signature) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as ReachOutPayload
    if (!payload.userId || !payload.contactId || typeof payload.exp !== 'number') return null
    if (payload.action != null && payload.action !== 'snooze') return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export function reachOutExpiry(now = Date.now()) {
  return now + 8 * 24 * 60 * 60 * 1000
}
