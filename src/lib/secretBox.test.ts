import { describe, expect, it } from 'vitest'
import { decryptString, encryptString } from './secretBox'

describe('secretBox', () => {
  it('round-trips a refresh token and rejects the wrong key', async () => {
    const packed = await encryptString('1//refresh-token', 'test-secret')
    expect(packed.startsWith('v1.')).toBe(true)
    expect(await decryptString(packed, 'test-secret')).toBe('1//refresh-token')
    await expect(decryptString(packed, 'other-secret')).rejects.toThrow()
  })
})
