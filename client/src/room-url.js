/**
 * A room is its link.
 *
 *   /room/k7m3qp        the generated id every room gets
 *   /room/c/samsroom    an alias somebody claimed, which needs a passphrase
 *
 * Every navigation here is a *replace*, never a push. Pressing back should
 * leave the app, not strand you on the empty landing form you passed through
 * on the way in — losing the room to a stray back gesture is the thing this
 * exists to stop.
 */

const ROOM = '/room/'
const CUSTOM = '/room/c/'

const URL_ID = /^[a-z0-9]{4,16}$/
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** What the address bar is asking for, or null if it is not asking for a room. */
export function routeFromPath(pathname = window.location.pathname) {
  if (pathname.startsWith(CUSTOM)) {
    const slug = trim(pathname.slice(CUSTOM.length))
    return slug.length >= 3 && slug.length <= 32 && SLUG.test(slug)
      ? { kind: 'slug', key: slug }
      : null
  }

  if (pathname.startsWith(ROOM)) {
    const urlId = trim(pathname.slice(ROOM.length))
    return URL_ID.test(urlId) ? { kind: 'url', key: urlId } : null
  }

  return null
}

/**
 * Reads whatever somebody pasted into the join box: a bare id, a custom name,
 * or the whole link they were sent. Pasting the link is what people actually do.
 */
export function parseRoomInput(value) {
  const raw = (value ?? '').trim()
  if (!raw) return null

  if (raw.includes('/')) {
    try {
      // Bare hosts like "example.com/room/abc" need a scheme to parse.
      const url = new URL(raw.includes('://') ? raw : 'https://' + raw)
      return routeFromPath(url.pathname)
    } catch {
      return null
    }
  }

  const key = trim(raw)
  if (URL_ID.test(key)) return { kind: 'url', key }
  if (key.length >= 3 && key.length <= 32 && SLUG.test(key)) return { kind: 'slug', key }
  return null
}

export function roomPath(session) {
  return session?.slug ? CUSTOM + session.slug : ROOM + session.urlId
}

/** The absolute link to hand somebody, or put in a QR code. */
export function roomUrl(session) {
  return new URL(roomPath(session), window.location.origin).toString()
}

export function showRoom(session) {
  const next = roomPath(session)
  if (window.location.pathname !== next) window.history.replaceState(null, '', next)
}

export function showLanding() {
  if (window.location.pathname !== '/') window.history.replaceState(null, '', '/')
}

function trim(value) {
  return value.replace(/\/+$/, '').toLowerCase()
}
