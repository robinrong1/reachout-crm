const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/

export const OAUTH_CODE_TTL_MS = 10 * 60 * 1000
export const OAUTH_ACCESS_TTL_SECONDS = 60 * 60
export const OAUTH_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type OauthAction = 'resource' | 'as' | 'register' | 'token' | 'client' | 'approve' | 'rpc'

export function oauthAction(url: URL): OauthAction {
  const query = url.searchParams.get('oauth')
  if (
    query === 'resource' ||
    query === 'as' ||
    query === 'register' ||
    query === 'token' ||
    query === 'client' ||
    query === 'approve'
  ) {
    return query
  }
  const path = url.pathname
  if (path.includes('oauth-protected-resource')) return 'resource'
  if (path.includes('oauth-authorization-server')) return 'as'
  if (path.endsWith('/register')) return 'register'
  if (path.endsWith('/token')) return 'token'
  if (path.endsWith('/approve')) return 'approve'
  if (path.endsWith('/client')) return 'client'
  return 'rpc'
}

/** Localhost from the dev proxy, otherwise the configured site. */
export function resolvePublicOrigin(appOrigin: string | null | undefined, forwarded: string | null | undefined) {
  const header = forwarded?.trim().replace(/\/$/, '') ?? ''
  if (LOCAL_ORIGIN.test(header)) return header
  const configured = appOrigin?.trim().replace(/\/$/, '') ?? ''
  return configured || null
}

/**
 * Origin baked into static OAuth discovery on Vercel.
 * Prefer the project production domain over a stale *.vercel.app APP_ORIGIN.
 */
export function resolveBuildOrigin(
  appOrigin: string | null | undefined,
  vercelProductionUrl: string | null | undefined,
) {
  const configured = appOrigin?.trim().replace(/\/$/, '') ?? ''
  const raw = vercelProductionUrl?.trim().replace(/\/$/, '') ?? ''
  const production = raw ? (raw.startsWith('http') ? raw : `https://${raw}`) : ''

  let configuredIsVercelApp = false
  if (configured) {
    try {
      configuredIsVercelApp = /\.vercel\.app$/i.test(new URL(configured).hostname)
    } catch {
      configuredIsVercelApp = false
    }
  }

  if (production && (!configured || configuredIsVercelApp)) return production
  return configured || production || null
}

export function acceptedResources(publicOrigin: string | null, functionUrl: string) {
  const urls = [functionUrl.replace(/\/$/, '')]
  if (publicOrigin) urls.push(`${publicOrigin}/mcp`)
  return urls
}

export function resourceMatches(resource: string | undefined, accepted: string[]) {
  if (!resource) return true
  return accepted.includes(resource.replace(/\/$/, ''))
}

export function isAllowedRedirectUri(uri: string) {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.username || url.password || url.hash) return false
  if (url.protocol === 'https:') return true
  if (url.protocol === 'http:') return LOCAL_ORIGIN.test(url.origin)
  return false
}

export function authorizationServerMetadata(publicOrigin: string, functionUrl: string) {
  const base = functionUrl.replace(/\/$/, '')
  return {
    issuer: publicOrigin,
    authorization_endpoint: `${publicOrigin}/oauth/authorize`,
    token_endpoint: `${base}?oauth=token`,
    registration_endpoint: `${base}?oauth=register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  }
}

export function protectedResourceMetadata(publicOrigin: string, functionUrl: string) {
  return {
    resource: `${publicOrigin}/mcp`,
    authorization_servers: [publicOrigin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
    resource_documentation: functionUrl,
  }
}

export function wwwAuthenticate(publicOrigin: string) {
  const metadata = `${publicOrigin}/.well-known/oauth-protected-resource/mcp`
  return `Bearer realm="reach", resource_metadata="${metadata}"`
}

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export async function pkceS256(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return toBase64Url(new Uint8Array(digest))
}

export async function pkceMatches(verifier: string, challenge: string) {
  if (verifier.length < 43 || verifier.length > 128) return false
  if (!/^[\w.~-]+$/.test(verifier)) return false
  const actual = await pkceS256(verifier)
  if (actual.length !== challenge.length) return false
  let mismatch = 0
  for (let index = 0; index < actual.length; index += 1) {
    mismatch |= actual.charCodeAt(index) ^ challenge.charCodeAt(index)
  }
  return mismatch === 0
}

export function randomId(prefix: string) {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `${prefix}${toBase64Url(bytes)}`
}

export function validateRegistration(body: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = body.redirect_uris
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5) {
    return { error: 'redirect_uris must be a list of one to five addresses' }
  }
  const redirectUris: string[] = []
  for (const uri of uris) {
    if (typeof uri !== 'string' || !isAllowedRedirectUri(uri)) {
      return { error: 'Each redirect address must be https, or http on localhost' }
    }
    redirectUris.push(uri)
  }
  const rawName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  const clientName = (rawName || 'MCP client').slice(0, 40)
  return { clientName, redirectUris }
}

export function authorizationRedirect(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}
