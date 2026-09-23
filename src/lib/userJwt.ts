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

async function hmac(secret: string, data: string) {
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

export async function signUserJwt(
  secret: string,
  input: { userId: string; issuer: string; email?: string; now?: number },
) {
  const now = input.now ?? Date.now()
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: 'authenticated',
        role: 'authenticated',
        sub: input.userId,
        email: input.email ?? '',
        iss: input.issuer,
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + 60,
      }),
    ),
  )
  const signature = await hmac(secret, `${header}.${payload}`)
  return `${header}.${payload}.${signature}`
}

export function readJwtPayload(token: string) {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const bytes = fromBase64Url(payload)
    return JSON.parse(new TextDecoder().decode(bytes)) as { sub?: string; role?: string; exp?: number }
  } catch {
    return null
  }
}
