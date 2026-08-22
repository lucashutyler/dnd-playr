import { buildApp } from './app.js'
import { openDatabase } from './db/index.js'

/**
 * A fresh in-memory database and app per test. Rate-limit counters live on the
 * app instance, so this also keeps limits from leaking between tests.
 */
export async function makeApp() {
  const db = openDatabase(':memory:')
  const app = await buildApp({ logger: false, db })
  return {
    app,
    db,
    async close() {
      await app.close()
      db.close()
    },
  }
}

export async function createRoom(app, body = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: body })
  return res.json()
}
