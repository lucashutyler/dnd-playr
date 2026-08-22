import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyRateLimit from '@fastify/rate-limit'
import { config } from './config.js'
import { openDatabase } from './db/index.js'
import sessionRoutes from './routes/sessions.js'
import { createHub } from './ws/hub.js'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, 'public')

/**
 * Builds the Fastify instance without listening, so tests can use app.inject().
 * Pass a db to point at ':memory:'; otherwise the configured file is opened.
 */
export async function buildApp({ logger = { level: config.logLevel }, db, presenceGraceMs } = {}) {
  const app = Fastify({
    logger,
    trustProxy: true,
    // Fastify's AJV defaults to removeAdditional, which silently strips unknown
    // fields. We would rather a malformed intent fail loudly than half-apply.
    ajv: { customOptions: { removeAdditional: false } },
  })

  const database = db ?? openDatabase(config.dbPath, { log: app.log })
  app.decorate('db', database)
  // Only close what we opened; a caller-supplied db is the caller's to close.
  if (!db) app.addHook('onClose', async () => database.close())

  // The websocket hub authenticates at upgrade and owns every live socket.
  const hub = createHub({ db: database, log: app.log, presenceGraceMs })
  hub.attach(app.server)
  app.decorate('hub', hub)
  app.addHook('onClose', async () => hub.close())

  // Off by default; routes opt in through config.rateLimit.
  await app.register(fastifyRateLimit, {
    global: false,
    // The plugin throws whatever this returns, so it carries its own status.
    errorResponseBuilder: () => ({ statusCode: 429, error: 'rate_limited' }),
  })

  app.get('/api/health', async () => ({
    ok: true,
    uptime: Math.round(process.uptime()),
  }))

  await app.register(sessionRoutes)

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
