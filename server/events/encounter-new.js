import { IntentError } from '../errors.js'

/**
 * Clears the board without losing anything. Every enemy still in play gets the
 * same archived_at, which is what makes them one encounter afterwards, and
 * their hits stay in the event log for the recap view to find later.
 */
export default {
  type: 'encounter.new',

  validate() {
    return null
  },

  apply({ db, session }) {
    const at = new Date().toISOString()
    const archived = db
      .prepare(
        `UPDATE enemies SET archived_at = ?
         WHERE session_id = ? AND archived_at IS NULL`,
      )
      .run(at, session.id).changes

    if (archived === 0) throw new IntentError('nothing_to_archive')
    return { archivedAt: at, count: archived }
  },

  /** One timestamp marked them, so one timestamp brings them all back. */
  undo({ db, session, logged }) {
    const restored = db
      .prepare('UPDATE enemies SET archived_at = NULL WHERE session_id = ? AND archived_at = ?')
      .run(session.id, logged.archivedAt).changes
    return { count: restored }
  },
}
