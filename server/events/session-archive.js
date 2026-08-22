import { IntentError } from '../errors.js'

/**
 * Closes the room. Nothing is destroyed: the characters, the ledger and the
 * whole event log stay exactly where they are, and reopening is one tap for
 * anyone still holding a token, or a join with the code for anyone who is not.
 */
export default {
  type: 'session.archive',

  validate(payload) {
    return typeof payload.archived === 'boolean' ? null : 'invalid_payload'
  },

  apply({ db, session, payload }) {
    const already = Boolean(session.archived_at)
    if (payload.archived === already) throw new IntentError('no_change')

    const archivedAt = payload.archived ? new Date().toISOString() : null
    db.prepare('UPDATE sessions SET archived_at = ?, updated_at = ? WHERE id = ?').run(
      archivedAt,
      new Date().toISOString(),
      session.id,
    )
    return { archived: payload.archived, previousArchivedAt: session.archived_at }
  },

  undo({ db, logged, session }) {
    db.prepare('UPDATE sessions SET archived_at = ? WHERE id = ?').run(
      logged.previousArchivedAt ?? null,
      session.id,
    )
    return { archived: Boolean(logged.previousArchivedAt) }
  },
}
