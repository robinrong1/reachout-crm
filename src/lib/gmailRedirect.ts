const CALLBACK_PATH = '/import/gmail/callback'

export function gmailCallbackUri(origin: string) {
  return `${origin.replace(/\/$/, '')}${CALLBACK_PATH}`
}

export function isAllowedGmailRedirect(redirectUri: string, appOrigin: string | null | undefined) {
  let url: URL
  try {
    url = new URL(redirectUri)
  } catch {
    return false
  }

  if (url.username || url.password || url.search || url.hash) return false
  if (url.pathname !== CALLBACK_PATH) return false

  if (url.protocol === 'http:' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url.origin)) {
    return true
  }

  const allowed = appOrigin?.trim().replace(/\/$/, '')
  return url.protocol === 'https:' && Boolean(allowed) && url.origin === allowed
}
