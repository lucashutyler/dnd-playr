import { findHandler } from './index.js'
import { IntentError } from '../errors.js'

// How far back a single undo will look. Deep enough for a run of taps at the
// table, shallow enough that the scan stays trivial.
const LOOKBACK = 50

/**
 * Takes back the sender's most recent reversible action.
 *
 * Only their own: someone else's mistake is not yours to undo from a toast.
 * Nothing is ever deleted or rewritten — undoing appends, like everything
 * else, and the record of the undo is itself an event.
 *
 * A handler is reversible exactly when it exports `undo`. The ones that do not
 * are the ones you can simply do again the other way round: renaming, editing
 * a field, marking a status.
 */
export default {
  type: 'history.undo',

  validate() {
    return null
  },

  apply({ db, session, member }) {
    const alreadyUndone = new Set(
      db
        .prepare(
          `SELECT json_extract(payload, '$.revertedEventId')
           FROM events
           WHERE session_id = ? AND type = 'history.undo'`,
        )
        .pluck()
        .all(session.id),
    )

    const recent = db
      .prepare(
        `SELECT id, type, payload FROM events
         WHERE session_id = ? AND member_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(session.id, member.id, LOOKBACK)

    for (const row of recent) {
      if (alreadyUndone.has(row.id)) continue

      const handler = findHandler(row.type)
      if (!handler?.undo) continue

      const logged = JSON.parse(row.payload)
      const result = handler.undo({ db, session, member, logged })

      return { revertedEventId: row.id, revertedType: row.type, ...result }
    }

    throw new IntentError('nothing_to_undo')
  },
}
