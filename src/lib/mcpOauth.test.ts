import { describe, expect, it } from 'vitest'
import {
  authorizationRedirect,
  isAllowedRedirectUri,
  oauthAction,
  pkceMatches,
  pkceS256,
  resolveBuildOrigin,
  resolvePublicOrigin,
  resourceMatches,
  validateRegistration,
  wwwAuthenticate,
} from './mcpOauth'

describe('oauth routing', () => {
  it('reads the oauth query the dev proxy adds', () => {
    expect(oauthAction(new URL('https://example.com/functions/v1/mcp?oauth=token'))).toBe('token')
    expect(oauthAction(new URL('https://example.com/functions/v1/mcp'))).toBe('rpc')
  })

  it('recognizes discovery paths', () => {
    expect(oauthAction(new URL('http://localhost:5177/.well-known/oauth-authorization-server'))).toBe('as')
    expect(oauthAction(new URL('http://localhost:5177/.well-known/oauth-protected-resource/mcp'))).toBe('resource')
  })
})

describe('public origin', () => {
  it('trusts a localhost forward and otherwise uses the configured site', () => {
    expect(resolvePublicOrigin('https://reach.example', 'http://localhost:5177')).toBe('http://localhost:5177')
    expect(resolvePublicOrigin('https://reach.example', 'https://evil.example')).toBe('https://reach.example')
    expect(resolvePublicOrigin('', null)).toBeNull()
  })

  it('prefers the Vercel production domain over a stale *.vercel.app APP_ORIGIN', () => {
    expect(resolveBuildOrigin('https://reach-gules.vercel.app', 'reach-outs.app')).toBe('https://reach-outs.app')
    expect(resolveBuildOrigin('https://reach-outs.app', 'reach-outs.app')).toBe('https://reach-outs.app')
    expect(resolveBuildOrigin('https://reach-outs.app', null)).toBe('https://reach-outs.app')
    expect(resolveBuildOrigin(null, 'reach-outs.app')).toBe('https://reach-outs.app')
    expect(resolveBuildOrigin(null, null)).toBeNull()
  })
})

describe('redirect addresses', () => {
  it('allows https and localhost http', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(isAllowedRedirectUri('http://127.0.0.1:53123/callback')).toBe(true)
    expect(isAllowedRedirectUri('http://localhost:5177/callback')).toBe(true)
  })

  it('rejects public http, fragments, and non-urls', () => {
    expect(isAllowedRedirectUri('http://example.com/callback')).toBe(false)
    expect(isAllowedRedirectUri('https://claude.ai/callback#code')).toBe(false)
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isAllowedRedirectUri('not a url')).toBe(false)
  })
})

describe('registration', () => {
  it('keeps a short name and the allowed addresses', () => {
    const result = validateRegistration({
      client_name: '  Claude  ',
      redirect_uris: ['http://127.0.0.1:53123/callback'],
    })
    expect(result).toEqual({ clientName: 'Claude', redirectUris: ['http://127.0.0.1:53123/callback'] })
  })

  it('rejects a list that contains a public http address', () => {
    const result = validateRegistration({ redirect_uris: ['http://example.com/cb'] })
    expect(result.error).toMatch(/localhost/)
  })
})

describe('pkce', () => {
  it('accepts the S256 challenge for a verifier and rejects a different one', async () => {
    const verifier = 'a'.repeat(43)
    const challenge = await pkceS256(verifier)
    expect(await pkceMatches(verifier, challenge)).toBe(true)
    expect(await pkceMatches(`${'b'.repeat(43)}`, challenge)).toBe(false)
    expect(await pkceMatches('short', challenge)).toBe(false)
  })
})

describe('authorization response', () => {
  it('adds the code and state without dropping an existing query', () => {
    expect(authorizationRedirect('http://127.0.0.1:9/callback?from=claude', { code: 'c', state: 's' })).toBe(
      'http://127.0.0.1:9/callback?from=claude&code=c&state=s',
    )
  })

  it('points the client at the site discovery document', () => {
    expect(wwwAuthenticate('http://localhost:5177')).toContain(
      'resource_metadata="http://localhost:5177/.well-known/oauth-protected-resource/mcp"',
    )
  })

  it('accepts the site resource and the function resource', () => {
    const accepted = ['https://project.supabase.co/functions/v1/mcp', 'http://localhost:5177/mcp']
    expect(resourceMatches('http://localhost:5177/mcp', accepted)).toBe(true)
    expect(resourceMatches('https://other.example/mcp', accepted)).toBe(false)
    expect(resourceMatches(undefined, accepted)).toBe(true)
  })
})
