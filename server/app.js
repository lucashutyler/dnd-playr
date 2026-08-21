import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { config } from './config.js'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, 'public')

/**
 * Builds the Fastify instance without listening, so tests can use app.inject().
 */
export async function buildApp({ logger = { level: config.logLevel } } = {}) {
  const app = Fastify({ logger, trustProxy: true })

  app.get('/api/health', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
  }))

  // In dev the client is served by Vite on :5173 and proxied here, so this
  // directory only exists after `npm run build`.
  if (existsSync(publicDir)) {
    await app.register(fastifyStatic, { root: publicDir })

    // Anything that is not an API or socket route is a client-side route.
    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? ''
      if (url.startsWith('/api') || url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'not_found' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
