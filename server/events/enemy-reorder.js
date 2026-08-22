import { isId } from './validators.js'
import { IntentError } from '../errors.js'

/** The whole order at once, so the list cannot end up half-sorted. */
export default {
  type: 'enemy.reorder',

  validate(payload) {
    if (!Array.isArray(payload.orderedIds) || payload.orderedIds.length === 0) {
      return 'invalid_payload'
    }
    if (payload.orderedIds.length > 128) return 'invalid_payload'
    if (!payload.orderedIds.every(isId)) return 'invalid_payload'
    if (new Set(payload.orderedIds).size !== payload.orderedIds.length) return 'invalid_payload'
    return null
  },

  apply({ db, session, payload }) {
    const live = new Set(
      db
        .prepare('SELECT id FROM enemies WHERE session_id = ? AND archived_at IS NULL')
        .pluck()
        .all(session.id),
    )
    if (payload.orderedIds.some((id) => !live.has(id))) throw new IntentError('no_such_enemy')

    const update = db.prepare('UPDATE enemies SET sort = ? WHERE id = ?')
    payload.orderedIds.forEach((id, index) => update.run(index, id))

    return { orderedIds: payload.orderedIds }
  },
}
