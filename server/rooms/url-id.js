import { randomInt } from 'node:crypto'

/**
 * The id in a room's shareable link.
 *
 * Lowercase and digits, minus the shapes people mistype when reading a link
 * off a screen. Six characters is about 887 million rooms; it widens rather
 * than ever giving up.
 */
export const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export const LENGTH = 6

export function randomUrlId(length = LENGTH) {
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export function allocateUrlId(db, { attempts = 12 } = {}) {
  const taken = db.prepare('SELECT 1 FROM sessions WHERE url_id = ?').pluck()

  for (let i = 0; i < attempts; i += 1) {
    // Widen every few misses. At six characters that will never happen; the
    // widening is here so it cannot spin forever if it somehow does.
    const id = randomUrlId(LENGTH + Math.floor(i / 4))
    if (!taken.get(id)) return id
  }
  throw new Error('could not allocate an unused room link')
}

export function findSessionByUrlId(db, urlId) {
  if (typeof urlId !== 'string') return null
  return db.prepare('SELECT * FROM sessions WHERE url_id = ?').get(urlId.toLowerCase()) ?? null
}

export function isValidUrlId(value) {
  return typeof value === 'string' && /^[a-z0-9]{4,16}$/.test(value.toLowerCase())
}

export function normalizeUrlId(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
