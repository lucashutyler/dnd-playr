import { computed, readonly, ref } from 'vue'

/**
 * The one composable that owns session state. Components read from it and call
 * its actions; nothing else talks to the server.
 *
 * Phase 1 is REST only. Phase 2 hangs the websocket off the same state, at
 * which point snapshots replace these fields wholesale.
 */

const TOKEN_KEY = 'dnd-playr.token'

// Module scope on purpose: one session per tab, shared by every component.
const token = ref(readStoredToken())
const session = ref(null)
const member = ref(null)
const status = ref('idle')
const error = ref(null)
const needsPassphrase = ref(false)

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

function adopt(payload) {
  session.value = payload.session
  member.value = payload.member
  status.value = 'ready'
  error.value = null
  needsPassphrase.value = false
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
  storeToken(null)
  session.value = null
  member.value = null
  status.value = 'idle'
  error.value = null
  needsPassphrase.value = false
}

function clearError() {
  error.value = null
}

export function useSession() {
  return {
    session: readonly(session),
    member: readonly(member),
    status: readonly(status),
    error: readonly(error),
    needsPassphrase: readonly(needsPassphrase),
    inRoom: computed(() => Boolean(session.value)),
    hasCharacter: computed(() => Boolean(member.value?.characterId)),
    busy: computed(() => status.value === 'loading'),
    resume,
    createRoom,
    joinRoom,
    leave,
    clearError,
  }
}
