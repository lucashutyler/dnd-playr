import { createEnemy } from '../enemies/store.js'
import { isText, NAME_MAX } from './validators.js'

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
    const label = payload.label.trim()
    const enemyId = createEnemy(db, session.id, label)
    return { enemyId, label }
  },
}
