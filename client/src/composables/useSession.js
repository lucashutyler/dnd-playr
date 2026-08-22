import { computed, readonly, ref } from 'vue'

/**
 * The one composable that owns session state. Components read from it and call
 * its actions; nothing else talks to the server.
 *
 * REST gets you a token and a seat. After that the websocket is the whole app:
 * the client sends intents, the server sends full snapshots, and a snapshot
 * always wins. There is no merge logic here and there should never be any.
 */

const TOKEN_KEY = 'dnd-playr.token'

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 15_000
// After this many failures with no successful open, check whether the token
// itself died rather than reconnecting into a wall forever.
const RETRIES_BEFORE_TOKEN_CHECK = 3
// Most drops are a server restart or a tunnel, and are over in well under a
// second. Saying "reconnecting" that fast just makes the app look flaky, so the
// badge waits to see whether it is a real outage.
const RECONNECT_BADGE_DELAY_MS = 3_000

// Module scope on purpose: one session per tab, shared by every component.
const token = ref(readStoredToken())
const session = ref(null)
const member = ref(null)
const members = ref([])
const characters = ref([])
const enemies = ref([])
const status = ref('idle')
const connection = ref('idle')
const error = ref(null)
const needsPassphrase = ref(false)

let socket = null
let retries = 0
let reconnectTimer = null
let badgeTimer = null
let deliberateClose = false

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Private browsing with storage disabled. The session just will not resume.
    return null
  }
}

function storeToken(value) {
  token.value = value
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* not fatal */
  }
}

const MESSAGES = {
  room_not_found: 'No room with that code.',
  room_locked: 'That room is locked.',
  passphrase_invalid: 'That passphrase does not match.',
  passphrase_required: 'This room needs a passphrase.',
  rate_limited: 'Too many tries. Give it a minute.',
  token_required: 'Sign in again.',
  token_invalid: 'Sign in again.',
  name_too_long: 'That name is too long.',
}

function messageFor(code) {
  return MESSAGES[code] ?? 'Something went wrong. Try again.'
}

async function api(path, { method = 'GET', body, auth } = {}) {
  const headers = {}
  if (body) headers['content-type'] = 'application/json'
  if (auth) headers.authorization = 'Bearer ' + auth

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, payload }
}

/* ---------------------------------------------------------------- socket -- */

function socketUrl() {
  const url = new URL('/ws', window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('token', token.value)
  return url.toString()
}

/** The snapshot replaces local state wholesale. Unconditionally. */
function applySnapshot(next) {
  session.value = next.session
  members.value = next.members
  characters.value = next.characters
  enemies.value = next.enemies
  // Our own row comes back in the members list; track it rather than a copy.
  const self = next.members.find((m) => m.id === member.value?.id)
  if (self) member.value = self
}

function onMessage(event) {
  let message
  try {
    message = JSON.parse(event.data)
  } catch {
    return
  }

  if (message.type === 'snapshot') applySnapshot(message.snapshot)
  else if (message.type === 'error') error.value = messageFor(message.error)
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)

  // Exponential with jitter, so a room full of phones does not stampede a
  // restarting server in lockstep.
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retries)
  const jittered = delay * (0.7 + Math.random() * 0.6)
  retries += 1

  reconnectTimer = setTimeout(async () => {
    if (retries > RETRIES_BEFORE_TOKEN_CHECK) {
      // Distinguish "server is down" from "this token is dead" — a rejected
      // upgrade looks identical to a network failure from in here.
      try {
        const { ok, status } = await api('/api/session', { auth: token.value })
        if (!ok && status === 401) return leave()
      } catch {
        // Unreachable says nothing about the token, and letting this reject
        // would kill the retry loop entirely. Keep going.
      }
    }
    connect()
  }, jittered)
}

function connect() {
  if (!token.value) return
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  )
    return

  // Only the very first attempt announces itself. A retry leaves the badge
  // alone and lets the delay below decide whether this is worth mentioning.
  if (connection.value === 'idle') connection.value = 'connecting'
  deliberateClose = false

  socket = new WebSocket(socketUrl())

  socket.addEventListener('open', () => {
    retries = 0
    clearTimeout(badgeTimer)
    connection.value = 'open'
    error.value = null
  })

  socket.addEventListener('message', onMessage)

  socket.addEventListener('close', () => {
    socket = null
    if (deliberateClose || !token.value) {
      clearTimeout(badgeTimer)
      connection.value = 'idle'
      return
    }
    clearTimeout(badgeTimer)
    badgeTimer = setTimeout(() => {
      if (connection.value !== 'open') connection.value = 'reconnecting'
    }, RECONNECT_BADGE_DELAY_MS)
    scheduleReconnect()
  })

  // 'error' is always followed by 'close', which is where reconnect lives.
  socket.addEventListener('error', () => {})
}

function disconnect() {
  deliberateClose = true
  clearTimeout(reconnectTimer)
  clearTimeout(badgeTimer)
  retries = 0
  socket?.close()
  socket = null
  connection.value = 'idle'
}

/** Fire-and-forget. The snapshot that follows is the real confirmation. */
function sendIntent(intent) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(intent))
  return true
}

/* ---------------------------------------------------------------- actions -- */

function adopt(payload) {
  session.value = payload.session
  member.value = payload.member
  members.value = []
  status.value = 'ready'
  error.value = null
  needsPassphrase.value = false
  connect()
}

/** Restores a stored token on load. Silent: a stale token is not an error. */
async function resume() {
  if (!token.value) return false

  status.value = 'loading'
  try {
    const { ok, payload } = await api('/api/session', { auth: token.value })
    if (ok) {
      adopt(payload)
      return true
    }
    storeToken(null)
  } catch {
    error.value = 'Could not reach the server.'
  }
  status.value = 'idle'
  return false
}

async function createRoom({ name = '', displayName = '', passphrase = '' } = {}) {
  status.value = 'loading'
  error.value = null

  const body = { name, displayName }
  if (passphrase) body.passphrase = passphrase

  try {
    const { ok, payload } = await api('/api/sessions', { method: 'POST', body })
    if (!ok) {
      error.value = messageFor(payload.error)
      status.value = 'idle'
      return false
    }
    storeToken(payload.token)
    adopt(payload)
    return true
  } catch {
    error.value = 'Could not reach the server.'
    status.value = 'idle'
    return false
  }
}

async function joinRoom({ code, displayName = '', passphrase = '' } = {}) {
  status.value = 'loading'
  error.value = null

  const body = { displayName }
  if (passphrase) body.passphrase = passphrase

  try {
    const url = '/api/sessions/' + encodeURIComponent(code.trim().toUpperCase()) + '/join'
    const { ok, payload } = await api(url, { method: 'POST', body })

    if (!ok) {
      // The server only reveals that a passphrase is needed once you ask.
      if (payload.error === 'passphrase_required') {
        needsPassphrase.value = true
        error.value = null
      } else {
        if (payload.error === 'passphrase_invalid') needsPassphrase.value = true
        error.value = messageFor(payload.error)
      }
      status.value = 'idle'
      return false
    }

    storeToken(payload.token)
    adopt(payload)
    return true
  } catch {
    error.value = 'Could not reach the server.'
    status.value = 'idle'
    return false
  }
}

/** Forgets this device's claim. The room and its characters are untouched. */
function leave() {
  disconnect()
  storeToken(null)
  session.value = null
  member.value = null
  members.value = []
  characters.value = []
  enemies.value = []
  status.value = 'idle'
  error.value = null
  needsPassphrase.value = false
}

function clearError() {
  error.value = null
}

const renameMe = (displayName) => sendIntent({ type: 'member.rename', displayName })
const renameRoom = (name) => sendIntent({ type: 'session.rename', name })

/* Characters. Every one of these is fire-and-forget: the snapshot that comes
   back is the confirmation, and it is the only thing that changes state. */
const createCharacter = (fields) => sendIntent({ type: 'character.create', ...fields })
const claimCharacter = (characterId) => sendIntent({ type: 'character.claim', characterId })
const releaseCharacter = () => sendIntent({ type: 'character.release' })
const updateCharacter = (fields) => sendIntent({ type: 'character.update', ...fields })

const damage = (amount) => sendIntent({ type: 'hp.damage', amount })
const heal = (amount) => sendIntent({ type: 'hp.heal', amount })
const setDeathSaves = (successes, failures) =>
  sendIntent({ type: 'death.set', successes, failures })

const addResource = (fields) => sendIntent({ type: 'resource.add', ...fields })
const adjustResource = (resourceId, delta) =>
  sendIntent({ type: 'resource.adjust', resourceId, delta })
const updateResource = (resourceId, fields) =>
  sendIntent({ type: 'resource.update', resourceId, ...fields })
const removeResource = (resourceId) => sendIntent({ type: 'resource.remove', resourceId })
const reorderResources = (orderedIds) => sendIntent({ type: 'resource.reorder', orderedIds })

const takeRest = (kind) => sendIntent({ type: 'rest.take', kind })

/* The enemy ledger. Damage counts up, healing counts down, and both are the
   same signed entry against a tally that never pretends to know a max. */
const addEnemy = (label) => sendIntent({ type: 'enemy.add', label })
const damageEnemy = (enemyId, amount) => sendIntent({ type: 'enemy.damage', enemyId, amount })
const healEnemy = (enemyId, amount) => sendIntent({ type: 'enemy.heal', enemyId, amount })
const updateEnemy = (enemyId, fields) => sendIntent({ type: 'enemy.update', enemyId, ...fields })
const removeEnemy = (enemyId) => sendIntent({ type: 'enemy.remove', enemyId })
const reorderEnemies = (orderedIds) => sendIntent({ type: 'enemy.reorder', orderedIds })
const newEncounter = () => sendIntent({ type: 'encounter.new' })

export function useSession() {
  return {
    session: readonly(session),
    member: readonly(member),
    members: readonly(members),
    characters: readonly(characters),
    enemies: readonly(enemies),
    status: readonly(status),
    connection: readonly(connection),
    error: readonly(error),
    needsPassphrase: readonly(needsPassphrase),

    inRoom: computed(() => Boolean(session.value)),
    hasCharacter: computed(() => Boolean(member.value?.characterId)),
    myCharacter: computed(
      () => characters.value.find((c) => c.id === member.value?.characterId) ?? null,
    ),
    busy: computed(() => status.value === 'loading'),
    live: computed(() => connection.value === 'open'),
    onlineCount: computed(() => members.value.filter((m) => m.online).length),

    resume,
    createRoom,
    joinRoom,
    leave,
    clearError,
    renameMe,
    renameRoom,
    createCharacter,
    claimCharacter,
    releaseCharacter,
    updateCharacter,
    damage,
    heal,
    setDeathSaves,
    addResource,
    adjustResource,
    updateResource,
    removeResource,
    reorderResources,
    takeRest,
    addEnemy,
    damageEnemy,
    healEnemy,
    updateEnemy,
    removeEnemy,
    reorderEnemies,
    newEncounter,

    /** Who dealt a hit. Members are never deleted, so this always resolves. */
    memberName: (id) => members.value.find((m) => m.id === id)?.displayName || 'Someone',
  }
}
