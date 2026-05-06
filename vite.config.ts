import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)

// On Windows, inject the system Root certificate store (including any
// corporate MITM CA) into Node's trusted list. Needed for `yahoo-finance2`
// and `@anthropic-ai/sdk` to work from dev behind a corporate proxy.
// Production (Netlify) is unaffected because this only runs during dev.
// We intentionally do NOT disable TLS verification.
if (process.platform === 'win32') {
  try {
    const winCa = require('win-ca/api') as { inject: (mode?: string) => void }
    winCa.inject('+')
  } catch (err) {
    console.warn('[vite.config] win-ca not available:', (err as Error).message)
  }
}

function netlifyFunctionsDev(functionsDir: string): Plugin {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || ''
        if (!rawUrl.startsWith('/.netlify/functions/')) {
          next()
          return
        }

        const parsed = new URL(rawUrl, 'http://localhost')
        const name = parsed.pathname
          .replace('/.netlify/functions/', '')
          .split('/')[0]

        if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'invalid_function_name' }))
          return
        }

        const fnPath = path.resolve(functionsDir, `${name}.js`)
        if (!fs.existsSync(fnPath)) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'function_not_found', name }))
          return
        }

        const queryStringParameters: Record<string, string> = {}
        parsed.searchParams.forEach((v, k) => {
          queryStringParameters[k] = v
        })

        const headers: Record<string, string> = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k] = v
          else if (Array.isArray(v)) headers[k] = v.join(',')
        }

        try {
          const resolved = require.resolve(fnPath)
          // Invalidate this function module + any files inside functions dir so edits hot-reload
          Object.keys(require.cache).forEach((cached) => {
            if (cached.startsWith(functionsDir)) delete require.cache[cached]
          })
          void resolved

          const mod = require(fnPath)
          if (typeof mod.handler !== 'function') {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'no_handler_export' }))
            return
          }

          const event = {
            httpMethod: req.method || 'GET',
            path: parsed.pathname,
            queryStringParameters,
            headers,
            body: null,
            isBase64Encoded: false,
          }

          const result = await mod.handler(event, {})
          res.statusCode = result?.statusCode ?? 200
          if (result?.headers) {
            for (const [k, v] of Object.entries(result.headers)) {
              if (typeof v === 'string') res.setHeader(k, v)
            }
          }
          if (!res.getHeader('content-type')) {
            res.setHeader('content-type', 'application/json')
          }
          res.end(result?.body ?? '')
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error(`[netlify-functions-dev] ${name}:`, err)
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'dev_function_error', message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v
  }

  const functionsDir = path.resolve(process.cwd(), 'netlify', 'functions')

  return {
    plugins: [
      react(),
      tailwindcss(),
      netlifyFunctionsDev(functionsDir),
    ],
  }
})
