import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { resolveBuildOrigin } from './src/lib/mcpOauth.ts'

/** Same documents as src/lib/mcpOauth.ts. Served here so clients can discover login on this site. */
function oauthDiscovery(supabaseUrl: string): Plugin {
  const functionUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mcp`

  function asMetadata(origin: string) {
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${functionUrl}?oauth=token`,
      registration_endpoint: `${functionUrl}?oauth=register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['mcp'],
    }
  }

  function resourceMetadata(origin: string) {
    return {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
    }
  }

  return {
    name: 'reach-oauth-discovery',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        const known =
          path === '/.well-known/oauth-authorization-server' ||
          path === '/.well-known/oauth-protected-resource' ||
          path === '/.well-known/oauth-protected-resource/mcp'
        if (!known || !req.headers.host) {
          next()
          return
        }
        const origin = `http://${req.headers.host}`
        const body = path === '/.well-known/oauth-authorization-server' ? asMetadata(origin) : resourceMetadata(origin)
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
    generateBundle() {
      const origin = resolveBuildOrigin(process.env.APP_ORIGIN, process.env.VERCEL_PROJECT_PRODUCTION_URL)
      if (!origin || !supabaseUrl) return
      const asDocument = JSON.stringify(asMetadata(origin))
      const resourceDocument = JSON.stringify(resourceMetadata(origin))
      this.emitFile({ type: 'asset', fileName: '.well-known/oauth-authorization-server', source: asDocument })
      // The unsuffixed URL is the same document. A second file at that path would
      // make this path a file and a directory, which the build cannot write.
      this.emitFile({ type: 'asset', fileName: '.well-known/oauth-protected-resource/mcp', source: resourceDocument })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const supabaseUrl = env.VITE_SUPABASE_URL ?? ''

  return {
    plugins: [oauthDiscovery(supabaseUrl), react(), tailwindcss()],
    server: supabaseUrl
      ? {
          proxy: {
            '/mcp': {
              target: supabaseUrl,
              changeOrigin: true,
              rewrite: (raw) => {
                const url = new URL(raw, 'http://localhost')
                const sub = url.pathname.replace(/^\/mcp/, '')
                const action =
                  sub === '/token'
                    ? 'token'
                    : sub === '/register'
                      ? 'register'
                      : sub === '/approve'
                        ? 'approve'
                        : sub === '/client'
                          ? 'client'
                          : 'rpc'
                url.searchParams.set('oauth', action)
                return `/functions/v1/mcp${url.search}`
              },
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq, incoming) => {
                  if (incoming.headers.host) {
                    proxyReq.setHeader('x-reach-public-origin', `http://${incoming.headers.host}`)
                  }
                })
              },
            },
          },
        }
      : undefined,
    test: {
      fileParallelism: false,
      env: {
        VITE_SUPABASE_URL: env.VITE_SUPABASE_URL ?? '',
        VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? '',
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      },
    },
  }
})
