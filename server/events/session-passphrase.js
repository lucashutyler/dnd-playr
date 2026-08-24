import { hashPassphrase } from '../auth/tokens.js'
import { IntentError } from '../errors.js'

const MIN = 4
const MAX = 200

/**
 * Sets, changes, or clears the room passphrase. Pass null to clear it.
 *
 * Hashing happens in prepare(), outside the write transaction — argon2id is
 * deliberately slow and has no business holding a database lock. Nothing about
 * the passphrase reaches the event log: the payload recorded is only whether
 * the room has one now.
 */
export default {
  type: 'session.passphrase',

  validate(payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, 'passphrase')) return 'invalid_payload'
    if (payload.passphrase === null) return null

    if (typeof payload.passphrase !== 'string') return 'invalid_payload'
    const trimmed = payload.passphrase.trim()
    if (trimmed.length < MIN) return 'passphrase_too_short'
    if (trimmed.length > MAX) return 'invalid_payload'
    return null
  },

  async prepare(payload) {
    if (payload.passphrase === null) return { hash: null }
    return { hash: await hashPassphrase(payload.passphrase.trim()) }
  },

  apply({ db, session, prepared }) {
    // A custom link is guessable by design, so it may not outlive the
    // passphrase that is actually protecting the room.
    if (!prepared.hash && session.slug) throw new IntentError('slug_needs_passphrase')

    db.prepare('UPDATE sessions SET passphrase_hash = ?, updated_at = ? WHERE id = ?').run(
      prepared.hash,
      new Date().toISOString(),
      session.id,
    )
    // Deliberately the whole logged payload. No plaintext, no hash, ever.
    return { hasPassphrase: Boolean(prepared.hash) }
  },
}
