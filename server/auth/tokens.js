import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Algorithm, hash as argonHash, verify as argonVerify } from '@node-rs/argon2'

/**
 * Two secrets live in this app and they want different treatment.
 *
 * Member tokens are 32 random bytes we generated. There is no weak token to
 * grind, so a slow KDF buys nothing and costs real latency on a path that runs
 * on every reconnect. SHA-256 is the right tool, same as any API key store.
 *
 * Room passphrases are chosen by a human at a table and will be "dragons". They
 * are exactly what argon2id exists for.
 */

const TOKEN_BYTES = 32

// OWASP's argon2id baseline: 19 MiB, 2 passes, 1 lane.
const ARGON = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

export function createToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Constant-time compare for two hex digests of equal length. */
export function tokenHashEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export function hashPassphrase(passphrase) {
  return argonHash(passphrase, ARGON)
}

export async function verifyPassphrase(passphrase, storedHash) {
  if (!storedHash) return false
  try {
    return await argonVerify(storedHash, passphrase, ARGON)
  } catch {
    return false
  }
}

/** Pulls a bearer token out of an Authorization header. */
export function bearerFrom(request) {
  const header = request.headers?.authorization
  if (typeof header !== 'string') return null
  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null
  return value.trim() || null
}
