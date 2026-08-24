import { IntentError } from '../errors.js'
import { checkSlug, findSessionBySlug, normalizeSlug } from '../rooms/slug.js'

/**
 * Claims or releases a custom link for the room. Pass null to release it.
 *
 * A room must already have a passphrase before it can take one — see the note
 * in rooms/slug.js for why.
 */
export default {
  type: 'session.slug',

  validate(payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, 'slug')) return 'invalid_payload'
    if (payload.slug === null) return null
    if (typeof payload.slug !== 'string') return 'invalid_payload'
    return checkSlug(payload.slug)
  },

  apply({ db, session, payload }) {
    const previous = session.slug ?? null

    if (payload.slug === null) {
      db.prepare('UPDATE sessions SET slug = NULL, updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        session.id,
      )
      return { slug: null, previousSlug: previous }
    }

    if (!session.passphrase_hash) throw new IntentError('slug_needs_passphrase')

    const slug = normalizeSlug(payload.slug)
    const taken = findSessionBySlug(db, slug)
    if (taken && taken.id !== session.id) throw new IntentError('slug_taken')

    db.prepare('UPDATE sessions SET slug = ?, updated_at = ? WHERE id = ?').run(
      slug,
      new Date().toISOString(),
      session.id,
    )
    return { slug, previousSlug: previous }
  },

  undo({ db, logged, session }) {
    db.prepare('UPDATE sessions SET slug = ? WHERE id = ?').run(
      logged.previousSlug ?? null,
      session.id,
    )
    return { slug: logged.previousSlug ?? null }
  },
}
