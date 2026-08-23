import { WebSocket, WebSocketServer } from 'ws'
import { hashToken } from '../auth/tokens.js'
import { findMemberByTokenHash, recordEvent, touchMember } from '../rooms/store.js'
import { findHandler } from '../events/index.js'
import { buildSnapshot } from '../snapshot.js'

const HEARTBEAT_MS = 30_000
const MAX_PAYLOAD = 64 * 1024

// A phone at a table locks, backgrounds, and wanders in and out of wifi all
// evening. Dropping someone off the roster the instant their socket closes made
// the party list flicker for people sitting right there, so a member stays
// present for a grace period after their last socket goes.
const PRESENCE_GRACE_MS = 60_000

// A sliding window per socket. Generous enough that nobody tapping a stepper
// as fast as they can will notice, tight enough that a runaway client cannot
// spin the room. Offenders are refused, not disconnected: a stuck finger is
// not a reason to throw somebody out of the game.
const INTENT_LIMIT = 60
const INTENT_WINDOW_MS = 10_000

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
export function createHub({ db, log, presenceGraceMs = PRESENCE_GRACE_MS } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })
  const rooms = new Map()
  // sessionId -> Map<memberId, expiresAt>. In memory only: presence is still
  // derived, never a column.
  const grace = new Map()
  const graceTimers = new Set()
  let attachedServer = null

  const socketsFor = (sessionId) => rooms.get(sessionId) ?? new Set()

  const hasLiveSocket = (sessionId, memberId) =>
    [...socketsFor(sessionId)].some((s) => s.member.id === memberId)

  /** Holds a member on the roster for a while after their last socket drops. */
  function startGrace(sessionId, memberId) {
    if (!grace.has(sessionId)) grace.set(sessionId, new Map())
    grace.get(sessionId).set(memberId, Date.now() + presenceGraceMs)

    // Nothing else would tell the room when the grace runs out.
    const timer = setTimeout(() => {
      graceTimers.delete(timer)
      broadcast(sessionId)
    }, presenceGraceMs + 25)
    timer.unref?.()
    graceTimers.add(timer)
  }

  function onlineMemberIds(sessionId) {
    const ids = new Set()
    for (const socket of socketsFor(sessionId)) ids.add(socket.member.id)

    const pending = grace.get(sessionId)
    if (pending) {
      const now = Date.now()
      for (const [memberId, expiresAt] of pending) {
        if (expiresAt > now) ids.add(memberId)
        else pending.delete(memberId)
      }
      if (pending.size === 0) grace.delete(sessionId)
    }

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
      // For logging. The code identifies a room; the token never gets near a log.
      ws.sessionCode = found.session.code
      wss.emit('connection', ws, request)
    })
  }

  /** True when this socket is inside its intent budget. */
  function withinRate(socket) {
    const now = Date.now()
    socket.intentTimes = (socket.intentTimes ?? []).filter((at) => now - at < INTENT_WINDOW_MS)
    if (socket.intentTimes.length >= INTENT_LIMIT) return false
    socket.intentTimes.push(now)
    return true
  }

  async function handleIntent(socket, raw) {
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

    // Counted before the handler is even looked up: a flood of intents we would
    // have rejected anyway should still run the sender out of budget.
    if (!withinRate(socket)) {
      log?.warn?.({ code: socket.sessionCode, memberId: socket.member.id }, 'socket rate limited')
      return fail(socket, intentId, 'rate_limited')
    }

    const type = message.type
    // Everything that is not envelope is payload.
    const payload = { ...message }
    delete payload.type
    delete payload.id
    const handler = findHandler(type)
    if (!handler) return fail(socket, intentId, 'unknown_intent')

    const invalid = handler.validate(payload)
    if (invalid) return fail(socket, intentId, invalid)

    // Anything slow or async happens before the transaction opens: hashing a
    // passphrase must not be holding a write lock while it runs.
    let prepared
    if (handler.prepare) {
      try {
        prepared = await handler.prepare(payload)
      } catch (err) {
        if (err?.expected) return fail(socket, intentId, err.code)
        log?.error?.({ err, type }, 'intent preparation failed')
        return fail(socket, intentId, 'intent_failed')
      }
    }

    // Re-read rather than trust the rows cached at upgrade. The room may have
    // been renamed since this socket connected, and the member's own claim
    // changes the moment they pick up a character — a stale row there would
    // apply damage to whoever they used to be playing.
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(socket.sessionId)
    if (!session) return fail(socket, intentId, 'room_gone')

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(socket.member.id)
    if (!member) return fail(socket, intentId, 'member_gone')

    try {
      db.transaction(() => {
        const logged = handler.apply({ db, session, member, payload, prepared })
        recordEvent(db, {
          sessionId: session.id,
          memberId: member.id,
          type,
          payload: logged ?? payload,
        })
      })()
    } catch (err) {
      // An IntentError is a refusal the client should see, not a bug worth logging.
      if (err?.expected) return fail(socket, intentId, err.code)
      log?.error?.({ err, type }, 'intent failed')
      return fail(socket, intentId, 'intent_failed')
    }

    log?.debug?.({ code: session.code, memberId: member.id, type }, 'intent applied')

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
    // Back before the grace ran out: they never left as far as the room knows.
    grace.get(socket.sessionId)?.delete(socket.member.id)

    touchMember(db, socket.member.id)
    log?.info?.(
      { code: socket.sessionCode, memberId: socket.member.id, sockets: wss.clients.size },
      'socket open',
    )
    // Everyone gets one, including the newcomer: presence just changed.
    broadcast(socket.sessionId)

    socket.on('message', (raw) => {
      handleIntent(socket, raw).catch((err) => log?.error?.({ err }, 'intent handler crashed'))
    })

    socket.on('error', (err) => log?.warn?.({ err }, 'socket error'))

    socket.on('close', () => {
      const sockets = socketsFor(socket.sessionId)
      sockets.delete(socket)

      // Only start the clock once their last device is gone — a phone closing
      // while the tablet stays open is not a departure.
      if (!hasLiveSocket(socket.sessionId, socket.member.id)) {
        startGrace(socket.sessionId, socket.member.id)
      }

      if (sockets.size === 0) rooms.delete(socket.sessionId)
      else broadcast(socket.sessionId)

      log?.info?.({ code: socket.sessionCode, memberId: socket.member.id }, 'socket closed')
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
      for (const timer of graceTimers) clearTimeout(timer)
      graceTimers.clear()
      grace.clear()
      attachedServer?.off('upgrade', handleUpgrade)
      // wss.clients is the authoritative set: a socket that errored before it
      // reached the registry would otherwise keep the HTTP server from closing.
      for (const socket of wss.clients) socket.terminate()
      rooms.clear()
      await new Promise((resolve) => wss.close(resolve))
    },
  }
}
