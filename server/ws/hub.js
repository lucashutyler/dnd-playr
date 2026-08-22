import { WebSocket, WebSocketServer } from 'ws'
import { hashToken } from '../auth/tokens.js'
import { findMemberByTokenHash, recordEvent, touchMember } from '../rooms/store.js'
import { findHandler } from '../events/index.js'
import { buildSnapshot } from '../snapshot.js'

const HEARTBEAT_MS = 30_000
const MAX_PAYLOAD = 64 * 1024

/**
 * The realtime spine.
 *
 * Connections authenticate once, at upgrade, via ?token=. The resolved member
 * is held on the socket, so the client never sends its own id and there is
 * nothing to forge in a later message.
 *
 * Every accepted intent runs the same pipeline: validate, apply, append to
 * events, then broadcast a full snapshot to everyone in the room.
 */
export function createHub({ db, log } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  const rooms = new Map()
  let attachedServer = null

  const socketsFor = (sessionId) => rooms.get(sessionId) ?? new Set()

  function onlineMemberIds(sessionId) {
    const ids = new Set()
    for (const socket of socketsFor(sessionId)) ids.add(socket.member.id)
    return ids
  }

  function send(socket, message) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  function fail(socket, intentId, error) {
    send(socket, { type: 'error', id: intentId, error })
  }

  /** Full snapshot to every socket in the room. No patches, ever. */
  function broadcast(sessionId) {
    const sockets = socketsFor(sessionId)
    if (sockets.size === 0) return

    const snapshot = buildSnapshot(db, sessionId, { onlineMemberIds: onlineMemberIds(sessionId) })
    if (!snapshot) return

    const frame = JSON.stringify({ type: 'snapshot', snapshot })
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) socket.send(frame)
    }
  }

  function rejectUpgrade(socket, status, reason) {
    socket.write('HTTP/1.1 ' + status + ' ' + reason + '\r\nConnection: close\r\n\r\n')
    socket.destroy()
  }

  function handleUpgrade(request, socket, head) {
    let url
    try {
      url = new URL(request.url, 'http://localhost')
    } catch {
      return rejectUpgrade(socket, 400, 'Bad Request')
    }

    if (url.pathname !== '/ws') return rejectUpgrade(socket, 404, 'Not Found')

    const token = url.searchParams.get('token')
    if (!token) return rejectUpgrade(socket, 401, 'Unauthorized')

    const found = findMemberByTokenHash(db, hashToken(token))
    if (!found) return rejectUpgrade(socket, 401, 'Unauthorized')

    wss.handleUpgrade(request, socket, head, (ws) => {
      // The server holds identity. Nothing on the wire carries a member id.
      ws.member = found.member
      ws.sessionId = found.session.id
      wss.emit('connection', ws, request)
    })
  }

  function handleIntent(socket, raw) {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return fail(socket, null, 'bad_json')
    }

    // Pull the id out before validating anything else, so a client can still
    // correlate the failure of a message we could not otherwise understand.
    const intentId = typeof message?.id === 'string' ? message.id : null
    if (!message || typeof message.type !== 'string') return fail(socket, intentId, 'bad_intent')

    const type = message.type
    // Everything that is not envelope is payload.
    const payload = { ...message }
    delete payload.type
    delete payload.id
    const handler = findHandler(type)
    if (!handler) return fail(socket, intentId, 'unknown_intent')

    const invalid = handler.validate(payload)
    if (invalid) return fail(socket, intentId, invalid)

    // Re-read rather than trust the row we cached at upgrade: the room may have
    // been renamed, or locked, by someone else since this socket connected.
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(socket.sessionId)
    if (!session) return fail(socket, intentId, 'room_gone')

    try {
      db.transaction(() => {
        const logged = handler.apply({ db, session, member: socket.member, payload })
        recordEvent(db, {
          sessionId: session.id,
          memberId: socket.member.id,
          type,
          payload: logged ?? payload,
        })
      })()
    } catch (err) {
      log?.error?.({ err, type }, 'intent failed')
      return fail(socket, intentId, 'intent_failed')
    }

    if (intentId) send(socket, { type: 'ack', id: intentId })
    broadcast(session.id)
  }

  wss.on('connection', (socket) => {
    socket.isAlive = true
    socket.on('pong', () => {
      socket.isAlive = true
    })

    if (!rooms.has(socket.sessionId)) rooms.set(socket.sessionId, new Set())
    rooms.get(socket.sessionId).add(socket)

    touchMember(db, socket.member.id)
    // Everyone gets one, including the newcomer: presence just changed.
    broadcast(socket.sessionId)

    socket.on('message', (raw) => handleIntent(socket, raw))

    socket.on('error', (err) => log?.warn?.({ err }, 'socket error'))

    socket.on('close', () => {
      const sockets = socketsFor(socket.sessionId)
      sockets.delete(socket)
      if (sockets.size === 0) rooms.delete(socket.sessionId)
      else broadcast(socket.sessionId)
    })
  })

  // A phone that walks out of wifi never sends a close frame. Ping everyone and
  // drop whoever missed the last round.
  const heartbeat = setInterval(() => {
    for (const sockets of rooms.values()) {
      for (const socket of sockets) {
        if (!socket.isAlive) {
          socket.terminate()
          continue
        }
        socket.isAlive = false
        socket.ping()
      }
    }
  }, HEARTBEAT_MS)
  heartbeat.unref?.()

  return {
    attach(server) {
      attachedServer = server
      server.on('upgrade', handleUpgrade)
    },
    broadcast,
    onlineMemberIds,
    countSockets: (sessionId) => socketsFor(sessionId).size,
    async close() {
      clearInterval(heartbeat)
      attachedServer?.off('upgrade', handleUpgrade)
      // wss.clients is the authoritative set: a socket that errored before it
      // reached the registry would otherwise keep the HTTP server from closing.
      for (const socket of wss.clients) socket.terminate()
      rooms.clear()
      await new Promise((resolve) => wss.close(resolve))
    },
  }
}
