/**
 * Locks the room against new joins. Everyone already seated stays, and their
 * tokens keep working — a lock is a door, not an eviction.
 */
export default {
  type: 'session.lock',

  validate(payload) {
    return typeof payload.locked === 'boolean' ? null : 'invalid_payload'
  },

  apply({ db, session, payload }) {
    db.prepare('UPDATE sessions SET locked = ?, updated_at = ? WHERE id = ?').run(
      payload.locked ? 1 : 0,
      new Date().toISOString(),
      session.id,
    )
    return { locked: payload.locked, previousLocked: Boolean(session.locked) }
  },

  undo({ db, logged, session }) {
    db.prepare('UPDATE sessions SET locked = ? WHERE id = ?').run(
      logged.previousLocked ? 1 : 0,
      session.id,
    )
    return { locked: logged.previousLocked }
  },
}
