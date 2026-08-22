import { applyDelta, requireEnemy } from '../enemies/store.js'
import { isCount, isId } from './validators.js'

/**
 * Damage the party dealt. The member comes off the socket, so every hit is
 * attributed without the client claiming who it was.
 */
export default {
  type: 'enemy.damage',

  validate(payload) {
    if (!isId(payload.enemyId)) return 'invalid_payload'
    return isCount(payload.amount, { min: 1 }) ? null : 'invalid_payload'
  },

  apply({ db, session, payload }) {
    const enemy = requireEnemy(db, session.id, payload.enemyId)
    const delta = payload.amount
    const total = applyDelta(db, enemy, delta)

    // delta and enemyId are what the history read model queries on.
    return { enemyId: enemy.id, label: enemy.label, delta, total }
  },

  undo({ db, session, logged }) {
    const enemy = requireEnemy(db, session.id, logged.enemyId)
    // The tally is never clamped, so subtracting the entry lands exactly.
    return { total: applyDelta(db, enemy, -logged.delta) }
  },
}
