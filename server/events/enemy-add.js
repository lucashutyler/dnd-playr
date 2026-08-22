import { createEnemy } from '../enemies/store.js'
import { isText, NAME_MAX } from './validators.js'
import { assertUnder, MAX_ENEMIES } from './limits.js'

/**
 * Any player, any label. The table calls it "big guy with the axe" and that is
 * exactly what goes in — there is no monster list to pick from.
 */
export default {
  type: 'enemy.add',

  validate(payload) {
    return isText(payload.label, NAME_MAX) ? null : 'invalid_payload'
  },

  apply({ db, session, payload }) {
    assertUnder(db, {
      sql: 'SELECT COUNT(*) FROM enemies WHERE session_id = ? AND archived_at IS NULL',
      args: [session.id],
      max: MAX_ENEMIES,
      error: 'too_many_enemies',
    })

    const label = payload.label.trim()
    const enemyId = createEnemy(db, session.id, label)
    return { enemyId, label }
  },
}
