import { describe, expect, it } from 'vitest'
import { gmailCallbackUri, isAllowedGmailRedirect } from './gmailRedirect'

describe('isAllowedGmailRedirect', () => {
  it('allows localhost and the configured https origin, only on the callback path', () => {
    expect(isAllowedGmailRedirect(gmailCallbackUri('http://localhost:5173'), null)).toBe(true)
    expect(isAllowedGmailRedirect(gmailCallbackUri('https://reach.example'), 'https://reach.example')).toBe(true)
    expect(isAllowedGmailRedirect('https://evil.example/import/gmail/callback', 'https://reach.example')).toBe(false)
    expect(isAllowedGmailRedirect('https://reach.example/import/gmail/callback?next=1', 'https://reach.example')).toBe(
      false,
    )
    expect(isAllowedGmailRedirect('http://reach.example/import/gmail/callback', 'http://reach.example')).toBe(false)
  })
})
