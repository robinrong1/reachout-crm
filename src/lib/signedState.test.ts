import { describe, expect, it } from 'vitest'
import { readPayload, signPayload } from './signedState'

describe('signedState', () => {
  it('reads a payload it signed and rejects tampering or expiry', async () => {
    const token = await signPayload('state-secret', { userId: 'user-1', exp: Date.now() + 60_000 })
    expect(await readPayload('state-secret', token)).toMatchObject({ userId: 'user-1' })

    const [body, signature] = token.split('.')
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`
    expect(await readPayload('state-secret', `${body}.${flipped}`)).toBeNull()
    expect(await readPayload('other-secret', token)).toBeNull()

    const expired = await signPayload('state-secret', { userId: 'user-1', exp: Date.now() - 1_000 })
    expect(await readPayload('state-secret', expired)).toBeNull()
  })
})