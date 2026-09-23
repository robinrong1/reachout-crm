import { describe, expect, it } from 'vitest'
import { normalizeNudge } from './contactFields'

describe('normalizeNudge', () => {
  it('keeps a short line, stores blanks as null, and rejects anything over 140', () => {
    expect(normalizeNudge('  Ask about the new job  ').value).toBe('Ask about the new job')
    expect(normalizeNudge('   ').value).toBeNull()
    expect(normalizeNudge(null).value).toBeNull()
    expect(normalizeNudge('x'.repeat(141)).error).toBeInstanceOf(Error)
  })
})
