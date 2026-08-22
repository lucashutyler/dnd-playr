import { requireEnemy } from '../enemies/store.js'
import { isId, isText, NAME_MAX } from './validators.js'

const STATUSES = ['active', 'defeated', 'fled']

/** Rename, or mark it down. Defeated ones stay on the list, just out of the way. */
export default {
  type: 'enemy.update',

  validate(payload) {
    if (!isId(payload.enemyId)) return 'invalid_payload'

    const keys = Object.keys(payload).filter((k) => k !== 'enemyId')
    if (keys.length === 0) return 'invalid_payload'
    if (keys.some((k) => !['label', 'status'].includes(k))) return 'invalid_payload'

    if (payload.label !== undefined && !isText(payload.label, NAME_MAX)) return 'invalid_payload'
    if (payload.status !== undefined && !STATUSES.includes(payload.status)) {
      return 'invalid_payload'
    }
    return null
  },

  apply({ db, session, payload }) {
    const enemy = requireEnemy(db, session.id, payload.enemyId)

    const label = payload.label === undefined ? enemy.label : payload.label.trim()
    const status = payload.status ?? enemy.status

    db.prepare('UPDATE enemies SET label = ?, status = ? WHERE id = ?').run(label, status, enemy.id)
    return { enemyId: enemy.id, label, status, previousStatus: enemy.status }
  },
}
