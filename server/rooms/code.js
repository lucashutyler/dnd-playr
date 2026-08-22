import { randomInt } from 'node:crypto'

// No I and no O: people read these out loud across a table, and half of them
// have had a beer. 24 letters ** 4 is ~332k rooms, which is plenty.
export const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const CODE_LENGTH = 4

export function randomCode(length = CODE_LENGTH) {
  let out = ''
  // randomInt is unbiased; a modulo of randomBytes would not be.
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export function isValidCode(value) {
  if (typeof value !== 'string') return false
  const code = value.toUpperCase()
  return code.length >= CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))
}

/** Codes are case-insensitive to type and canonically uppercase to store. */
export function normalizeCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

/**
 * Finds a code nobody is using. Widens by one character if we somehow lose the
 * dice roll repeatedly, so this can never spin forever.
 */
export function allocateCode(db, { attempts = 12 } = {}) {
  const taken = db.prepare('SELECT 1 FROM sessions WHERE code = ?').pluck()

  for (let i = 0; i < attempts; i += 1) {
    const length = CODE_LENGTH + Math.floor(i / 6)
    const code = randomCode(length)
    if (!taken.get(code)) return code
  }
  throw new Error('could not allocate an unused room code')
}
