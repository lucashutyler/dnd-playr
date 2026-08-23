import { buildApp } from './app.js'
import { config } from './config.js'

// If shutdown ever stops finishing, a restart should still complete rather
// than hang a deploy waiting on it.
const FORCE_EXIT_MS = 10_000

const app = await buildApp()

try {
  await app.listen({ port: config.port, host: config.host })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down')

    const force = setTimeout(() => {
      app.log.error({ signal }, 'shutdown did not finish, exiting anyway')
      process.exit(1)
    }, FORCE_EXIT_MS)
    // Unref'd so it never keeps the process alive by itself; it still fires if
    // something else does.
    force.unref()

    try {
      await app.close()
    } catch (err) {
      app.log.error({ err }, 'shutdown failed')
    }

    clearTimeout(force)
    // No process.exit() on the happy path: it truncates pino's pending writes,
    // so the shutdown would never appear in its own log. Nothing is left
    // holding the loop open, so the process ends on its own.
  })
}
