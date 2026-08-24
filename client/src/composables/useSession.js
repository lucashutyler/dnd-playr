import { computed, readonly, ref } from 'vue'
import { formFor, roomUrl, routeFromPath, showLanding, showRoom } from '../room-url.js'

/**
 * The one composable that owns session state. Components read from it and call
 * its actions; nothing else talks to the server.
 *
 * REST gets you a token and a seat. After that the websocket is the whole app:
 * the client sends intents, the server sends full snapshots, and a snapshot
 * always wins. There is no merge logic here and there should never be any.
 */

// One seat per room, remembered per device. Keyed by the room's link id so
// that opening somebody else's link does not resume the room you were last in.
const TOKENS_KEY = 'dnd-playr.tokens'
const LAST_KEY = 'dnd-playr.last'
// Before rooms had links there was a single token. Upgrade it once, quietly.
const LEGACY_TOKEN_KEY = 'dnd-playr.token'

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 15_000
// After this many failures with no successful open, check whether the token
// itself died rather than reconnecting into a wall forever.
const RETRIES_BEFORE_TOKEN_CHECK = 3
// Most drops are a server restart or a tunnel, and are over in well under a
// second. Saying "reconnecting" that fast just makes the app look flaky, so the
// badge waits to see whether it is a real outage.
const RECONNECT_BADGE_DELAY_MS = 3_000
// How long the undo offer stays on screen. Long enough to notice a mis-tap,
// short enough not to sit over the thing you are looking at.
const TOAST_MS = 6_000

// Module scope on purpose: one session per tab, shared by every component.
const token = ref(null)
// The name of a room the address bar asked for that we hold no seat in yet,
// spelled the way the visitor spelled it.
const pendingRoom = ref(null)
// Which form this visit came in on, so nothing rewrites the address bar.
let addressForm = null
const session = ref(null)
const member = ref(null)
const members = ref([])
const characters = ref([])
const enemies = ref([])
const status = ref('idle')
const connection = ref('idle')
const error = ref(null)
const needsPassphrase = ref(false)
const closedRoom = ref(null)
const toast = ref(null)

let socket = null
let retries = 0
let reconnectTimer = null
let badgeTimer = null
let toastTimer = null
let deliberateClose = false
let intentSeq = 0
// Intents we sent that are still waiting on an ack, and what to say if it lands.
const awaiting = new Map()

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    // Private browsing with storage disabled, or something else wrote junk
    // here. Either way the session just will not resume.
    return fallback
  }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* not fatal */
  }
}

const seats = () => readStore(TOKENS_KEY, {})
const lastRoom = () => readStore(LAST_KEY, null)

function tokenFor(urlId) {
  return urlId ? (seats()[urlId] ?? null) : null
}

function rememberSeat(urlId, value) {
  const next = { ...seats() }
  if (value) next[urlId] = value
  else delete next[urlId]

  writeStore(TOKENS_KEY, next)
  writeStore(LAST_KEY, value ? urlId : null)
  token.value = value
}

/** Carries a pre-links token across, so a playtest device is not logged out. */
function legacyToken() {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY)
  } catch {
    return null
  }
}

function dropLegacyToken() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY)
  } catch {
    /* not fatal */
  }
}

const MESSAGES = {
  room_locked: 'That room is locked.',
  passphrase_invalid: 'That passphrase does not match.',
  passphrase_required: 'This room needs a passphrase.',
  rate_limited: 'Too many tries. Give it a minute.',
  token_required: 'Sign in again.',
  token_invalid: 'Sign in again.',
  name_too_long: 'That name is too long.',
  passphrase_too_short: 'A passphrase needs at least four characters.',
  room_closed: 'That room is closed.',
  room_not_found: 'No room at that link.',
  slug_taken: 'Somebody already has that name.',
  slug_reserved: 'That name is spoken for.',
  slug_invalid: 'Letters, numbers and hyphens, three to thirty-two characters.',
  slug_needs_passphrase: 'A custom link needs a passphrase on the room first.',
  no_change: 'Nothing to change there.',
  nothing_to_undo: 'Nothing left to undo.',
  too_many_characters: 'This room is full of characters.',
  too_many_enemies: 'That is a lot of enemies. Start a new encounter first.',
  too_many_resources: 'That character has all the tracks it can hold.',
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
  // The address bar only ever changes when the URL somebody is on stops
  // working — a custom name released out from under it. Once it has had to
  // fall back, it stays fallen back rather than springing to a reclaimed name.
  addressForm = formFor(next.session, addressForm)
  showRoom(next.session, addressForm)
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

  if (message.type === 'snapshot') {
    applySnapshot(message.snapshot)
  } else if (message.type === 'ack') {
    // Only offer to take something back once the server says it happened.
    const label = awaiting.get(message.id)
    awaiting.delete(message.id)
    if (label) showToast(label)
  } else if (message.type === 'error') {
    awaiting.delete(message.id)
    error.value = messageFor(message.error)
  }
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

/**
 * The snapshot that follows is the real confirmation. Pass `undoLabel` for the
 * actions worth offering to take back; that carries an id so the ack can be
 * matched, and everything else stays fire-and-forget.
 */
function sendIntent(intent, undoLabel = null) {
  if (socket?.readyState !== WebSocket.OPEN) return false

  if (undoLabel) {
    intentSeq += 1
    const id = 'i' + intentSeq
    awaiting.set(id, undoLabel)
    socket.send(JSON.stringify({ ...intent, id }))
    return true
  }

  socket.send(JSON.stringify(intent))
  return true
}

function showToast(label) {
  clearTimeout(toastTimer)
  // A new action replaces the old offer, and undo always means "the last thing".
  toast.value = { label }
  toastTimer = setTimeout(() => {
    toast.value = null
  }, TOAST_MS)
}

function dismissToast() {
  clearTimeout(toastTimer)
  toast.value = null
}

function undoLast() {
  dismissToast()
  sendIntent({ type: 'history.undo' })
}

/* ---------------------------------------------------------------- actions -- */

function adopt(payload, seatToken, form = null) {
  addressForm = form ?? { kind: 'url', key: payload.session.urlId }
  session.value = payload.session
  member.value = payload.member
  members.value = []
  status.value = 'ready'
  error.value = null
  needsPassphrase.value = false
  pendingRoom.value = null

  if (seatToken) rememberSeat(payload.session.urlId, seatToken)
  // Puts the room in the address bar, in whichever form got us here.
  showRoom(payload.session, addressForm)
  connect()
}

/** Turns a custom link into the room it points at. */
async function resolveSlug(slug) {
  try {
    const { ok, payload } = await api('/api/sessions/c/' + encodeURIComponent(slug))
    return ok ? payload.urlId : null
  } catch {
    return null
  }
}

/**
 * Works out which room this load is for and whether we already have a seat.
 *
 * A link in the address bar wins over whatever this device was last in — that
 * is the whole point of being sent one. If we hold no seat there, the room is
 * remembered as pending so the landing screen can offer to join it rather than
 * making somebody retype what they just clicked.
 */
async function resume() {
  status.value = 'loading'

  const route = routeFromPath()
  let wanted = route?.kind === 'url' ? route.key : null
  // A custom name is resolved behind the scenes. It is never swapped out for
  // the id it points at — the name somebody used is the name they keep.
  if (route?.kind === 'slug') wanted = await resolveSlug(route.key)

  const urlId = wanted ?? lastRoom()
  let seat = tokenFor(urlId)

  // One-time upgrade from the single token that predates room links.
  const legacy = !seat && !wanted ? legacyToken() : null
  if (legacy) seat = legacy

  if (!seat) {
    // Offer the join with what they actually typed or were sent.
    pendingRoom.value = route?.key ?? null
    status.value = 'idle'
    return false
  }

  try {
    const { ok, payload } = await api('/api/session', { auth: seat })
    if (ok) {
      adopt(payload, seat, route)
      if (legacy) dropLegacyToken()
      return true
    }
    // A dead token for this room, not for every room.
    if (urlId) rememberSeat(urlId, null)
    if (legacy) dropLegacyToken()
    pendingRoom.value = route?.key ?? null
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
    adopt(payload, payload.token)
    return true
  } catch {
    error.value = 'Could not reach the server.'
    status.value = 'idle'
    return false
  }
}

async function joinRoom({ room, displayName = '', passphrase = '', restore = false } = {}) {
  status.value = 'loading'
  error.value = null

  const body = { displayName }
  if (passphrase) body.passphrase = passphrase
  if (restore) body.restore = true

  try {
    // Sent as typed. A name and a link id can look identical, and only the
    // server knows both namespaces well enough to say which this is.
    const key = room?.key
    if (!key) {
      error.value = messageFor('room_not_found')
      status.value = 'idle'
      return false
    }

    const url = '/api/sessions/' + encodeURIComponent(key) + '/join'
    const { ok, payload } = await api(url, { method: 'POST', body })

    if (!ok) {
      // The server only reveals that a passphrase is needed once you ask.
      if (payload.error === 'passphrase_required') {
        needsPassphrase.value = true
        error.value = null
      } else if (payload.error === 'room_closed') {
        // Reopening is offered rather than done, so nobody does it by accident.
        closedRoom.value = key
        error.value = null
      } else {
        if (payload.error === 'passphrase_invalid') needsPassphrase.value = true
        error.value = messageFor(payload.error)
      }
      status.value = 'idle'
      return false
    }

    closedRoom.value = null
    // Joined by name? Then stay on the name.
    adopt(payload, payload.token, room)
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
  dismissToast()
  addressForm = null
  // Only this room's seat. Other rooms on this device are none of its business.
  if (session.value?.urlId) rememberSeat(session.value.urlId, null)
  showLanding()
  session.value = null
  member.value = null
  members.value = []
  characters.value = []
  enemies.value = []
  status.value = 'idle'
  error.value = null
  needsPassphrase.value = false
  closedRoom.value = null
  pendingRoom.value = null
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
const releaseCharacter = (name = 'character') =>
  sendIntent({ type: 'character.release' }, 'Put down ' + name)
const updateCharacter = (fields) => sendIntent({ type: 'character.update', ...fields })

const damage = (amount) => sendIntent({ type: 'hp.damage', amount }, 'Took ' + amount + ' damage')
const heal = (amount) => sendIntent({ type: 'hp.heal', amount }, 'Healed ' + amount)
const setDeathSaves = (successes, failures) =>
  sendIntent({ type: 'death.set', successes, failures })

const addResource = (fields) => sendIntent({ type: 'resource.add', ...fields })
const adjustResource = (resourceId, delta, name = 'track') =>
  sendIntent(
    { type: 'resource.adjust', resourceId, delta },
    (delta < 0 ? 'Spent ' + -delta + ' ' : 'Restored ' + delta + ' ') + name,
  )
const updateResource = (resourceId, fields) =>
  sendIntent({ type: 'resource.update', resourceId, ...fields })
const removeResource = (resourceId, name = 'track') =>
  sendIntent({ type: 'resource.remove', resourceId }, 'Removed ' + name)
const reorderResources = (orderedIds) => sendIntent({ type: 'resource.reorder', orderedIds })

const takeRest = (kind) => sendIntent({ type: 'rest.take', kind })

/* The enemy ledger. Damage counts up, healing counts down, and both are the
   same signed entry against a tally that never pretends to know a max. */
const addEnemy = (label) => sendIntent({ type: 'enemy.add', label })
const damageEnemy = (enemyId, amount, label = 'it') =>
  sendIntent({ type: 'enemy.damage', enemyId, amount }, amount + ' damage to ' + label)
const healEnemy = (enemyId, amount, label = 'it') =>
  sendIntent({ type: 'enemy.heal', enemyId, amount }, label + ' healed ' + amount)
const updateEnemy = (enemyId, fields, undoLabel = null) =>
  sendIntent({ type: 'enemy.update', enemyId, ...fields }, undoLabel)
const removeEnemy = (enemyId, label = 'enemy') =>
  sendIntent({ type: 'enemy.remove', enemyId }, 'Removed ' + label)
const reorderEnemies = (orderedIds) => sendIntent({ type: 'enemy.reorder', orderedIds })
const newEncounter = () => sendIntent({ type: 'encounter.new' }, 'Cleared the board')

/* Room settings. Anyone seated can change these — the room is the boundary,
   not any one person inside it. */
const setPassphrase = (passphrase) => sendIntent({ type: 'session.passphrase', passphrase })
const setLocked = (locked) =>
  sendIntent({ type: 'session.lock', locked }, locked ? 'Locked the room' : 'Unlocked the room')
const setArchived = (archived) =>
  sendIntent({ type: 'session.archive', archived }, archived ? 'Closed the room' : null)
const setSlug = (slug) =>
  sendIntent({ type: 'session.slug', slug }, slug ? 'Claimed a custom link' : 'Released the link')

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
    closedRoom: readonly(closedRoom),
    pendingRoom: readonly(pendingRoom),
    toast: readonly(toast),

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
    dismissToast,
    undoLast,
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
    setPassphrase,
    setLocked,
    setArchived,
    setSlug,

    /** The link to share, custom name if there is one. */
    shareUrl: computed(() => (session.value ? roomUrl(session.value) : '')),

    /** Who dealt a hit. Members are never deleted, so this always resolves. */
    memberName: (id) => members.value.find((m) => m.id === id)?.displayName || 'Someone',
  }
}
