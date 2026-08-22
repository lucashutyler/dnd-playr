import { requireEnemy } from '../enemies/store.js'
import { isId } from './validators.js'

/**
 * For the one somebody added twice by mistake. Real enemies get archived by
 * ending the encounter instead, which keeps their history.
 */
export default {
  type: 'enemy.remove',

  validate(payload) {
    return isId(payload.enemyId) ? null : 'invalid_payload'
  },

  apply({ db, session, payload }) {
    const enemy = requireEnemy(db, session.id, payload.enemyId)
    db.prepare('DELETE FROM enemies WHERE id = ?').run(enemy.id)

    // Enough to put it back, since undo is an inverse append.
    return {
      enemyId: enemy.id,
      label: enemy.label,
      damageTotal: enemy.damage_total,
      status: enemy.status,
    }
  },
}
