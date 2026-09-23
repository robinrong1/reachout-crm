const VERSION = 'v1'

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function aesKey(secret: string, usages: KeyUsage[]) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, usages)
}

export async function encryptString(plaintext: string, secret: string) {
  const key = await aesKey(secret, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
  )
  const packed = new Uint8Array(iv.length + cipher.length)
  packed.set(iv, 0)
  packed.set(cipher, iv.length)
  return `${VERSION}.${bytesToBase64(packed)}`
}

export async function decryptString(payload: string, secret: string) {
  const [version, data] = payload.split('.')
  if (version !== VERSION || !data) throw new Error('Unrecognized secret')
  const packed = base64ToBytes(data)
  const key = await aesKey(secret, ['decrypt'])
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: packed.slice(0, 12) },
    key,
    packed.slice(12),
  )
  return new TextDecoder().decode(plain)
}
