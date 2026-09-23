const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/

export function corsHeaders(requestOrigin: string | null) {
  const appOrigin = Deno.env.get('APP_ORIGIN')?.trim().replace(/\/$/, '') ?? ''
  const allowed =
    requestOrigin && (requestOrigin === appOrigin || LOCAL_ORIGIN.test(requestOrigin))
      ? requestOrigin
      : appOrigin || 'http://localhost:5173'

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'WWW-Authenticate',
    Vary: 'Origin',
  }
}

export function jsonResponse(status: number, body: unknown, request: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request.headers.get('Origin')),
      'Content-Type': 'application/json',
    },
  })
}
