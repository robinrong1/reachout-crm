function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function signBytes(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return toBase64Url(new Uint8Array(signature))
}

export async function signPayload(secret: string, payload: Record<string, unknown>) {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await signBytes(secret, body)
  return `${body}.${signature}`
}

export async function readPayload<T extends Record<string, unknown>>(secret: string, token: string): Promise<T | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  const expected = await signBytes(secret, body)
  if (expected.length !== signature.length) return null
  let mismatch = 0
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index)
  }
  if (mismatch !== 0) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T
    if (!payload || typeof payload !== 'object') return null
    if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
