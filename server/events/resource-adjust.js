import {
  clampResource,
  requireClaimed,
  requireResource,
  touchCharacter,
} from '../characters/store.js'
import { isCount, isId } from './validators.js'

/**
 * Spend or restore, as a delta rather than an absolute. This is the most
 * tapped control in the app, and a delta cannot land wrong when two taps race.
 */
export default {
  type: 'resource.adjust',

  validate(payload) {
    if (!isId(payload.resourceId)) return 'invalid_payload'
    if (!isCount(payload.delta, { min: -999, max: 999 })) return 'invalid_payload'
    if (payload.delta === 0) return 'invalid_payload'
    return null
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)
    const resource = requireResource(db, character.id, payload.resourceId)

    const current = clampResource(resource.current + payload.delta, resource.max)
    db.prepare('UPDATE resources SET current = ? WHERE id = ?').run(current, resource.id)
    touchCharacter(db, character.id)

    return { characterId: character.id, resourceId: resource.id, delta: payload.delta, current }
  },
}
