import { applyDelta, requireEnemy } from '../enemies/store.js'
import { isCount, isId } from './validators.js'

/**
 * Monsters get healed, and a tally that cannot go down would be a lie. This is
 * the same ledger entry as damage with the sign flipped.
 */
export default {
  type: 'enemy.heal',

  validate(payload) {
    if (!isId(payload.enemyId)) return 'invalid_payload'
    return isCount(payload.amount, { min: 1 }) ? null : 'invalid_payload'
  },

  apply({ db, session, payload }) {
    const enemy = requireEnemy(db, session.id, payload.enemyId)
    const delta = -payload.amount
    const total = applyDelta(db, enemy, delta)

    return { enemyId: enemy.id, label: enemy.label, delta, total }
  },
}
