import { WebSocket } from 'ws'
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

/** Same, but actually listening, because websockets need a real socket. */
export async function makeLiveApp() {
  const ctx = await makeApp()
  await ctx.app.listen({ port: 0, host: '127.0.0.1' })
  const { port } = ctx.app.server.address()
  return { ...ctx, port, wsUrl: `ws://127.0.0.1:${port}/ws` }
}

export async function createRoom(app, body = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/sessions', payload: body })
  return res.json()
}

/**
 * A websocket client that queues frames, so a test can await the next one
 * without racing the connection.
 */
export function wsClient(url, token) {
  const full = token === undefined ? url : `${url}?token=${encodeURIComponent(token)}`
  const socket = new WebSocket(full)

  const queue = []
  const waiters = []

  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString())
    if (waiters.length) waiters.shift()(message)
    else queue.push(message)
  })

  return {
    socket,

    open() {
      return new Promise((resolve, reject) => {
        socket.once('open', resolve)
        socket.once('error', reject)
      })
    },

    /** Resolves with the HTTP status when the upgrade is refused. */
    rejection() {
      return new Promise((resolve, reject) => {
        socket.once('unexpected-response', (_req, res) => resolve(res.statusCode))
        socket.once('open', () => reject(new Error('expected the upgrade to be refused')))
      })
    },

    next(timeout = 2000) {
      if (queue.length) return Promise.resolve(queue.shift())
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for a frame')), timeout)
        waiters.push((message) => {
          clearTimeout(timer)
          resolve(message)
        })
      })
    },

    /** Frames already delivered, without waiting for more. */
    drain() {
      return queue.splice(0, queue.length)
    },

    send(message) {
      socket.send(JSON.stringify(message))
    },

    close() {
      return new Promise((resolve) => {
        if (socket.readyState === WebSocket.CLOSED) return resolve()
        socket.once('close', resolve)
        socket.close()
      })
    },
  }
}
