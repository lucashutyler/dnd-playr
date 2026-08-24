/**
 * Custom room links.
 *
 * A generated code is four letters of entropy nobody can guess. A slug someone
 * chose is the opposite: "samsroom" is the first thing anyone would try. So a
 * room may only take a custom link once it has a passphrase, and it may not
 * drop the passphrase while it still has one. The slug is convenience; the
 * passphrase is the actual door.
 */

export const SLUG_MIN = 3
export const SLUG_MAX = 32

// Anything the router owns, plus a few that would read as a mistake.
const RESERVED = new Set([
  'api',
  'ws',
  'assets',
  'room',
  'rooms',
  'c',
  'r',
  'new',
  'join',
  'create',
  'admin',
  'health',
  'static',
  'public',
  'favicon',
])

export function normalizeSlug(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/** Returns an error code, or null when the slug is usable. */
export function checkSlug(value) {
  const slug = normalizeSlug(value)

  // Reserved first: "c" is both reserved and too short, and being told it is
  // taken by the app is more use than being told it is two letters shy.
  if (RESERVED.has(slug)) return 'slug_reserved'

  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return 'slug_invalid'
  // Letters, digits and inner hyphens. No leading or trailing hyphen, so a link
  // never looks broken when it wraps.
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return 'slug_invalid'
  if (slug.includes('--')) return 'slug_invalid'
  return null
}

export function findSessionBySlug(db, slug) {
  return db.prepare('SELECT * FROM sessions WHERE slug = ?').get(normalizeSlug(slug)) ?? null
}
