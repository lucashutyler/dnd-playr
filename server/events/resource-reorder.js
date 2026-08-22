import { requireClaimed, touchCharacter } from '../characters/store.js'
import { isId } from './validators.js'
import { IntentError } from '../errors.js'

/** The whole order at once, so the list cannot end up half-sorted. */
export default {
  type: 'resource.reorder',

  validate(payload) {
    if (!Array.isArray(payload.orderedIds) || payload.orderedIds.length === 0) {
      return 'invalid_payload'
    }
    if (payload.orderedIds.length > 64) return 'invalid_payload'
    if (!payload.orderedIds.every(isId)) return 'invalid_payload'
    if (new Set(payload.orderedIds).size !== payload.orderedIds.length) return 'invalid_payload'
    return null
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)

    const owned = new Set(
      db.prepare('SELECT id FROM resources WHERE character_id = ?').pluck().all(character.id),
    )
    if (payload.orderedIds.some((id) => !owned.has(id))) throw new IntentError('no_such_resource')

    const update = db.prepare('UPDATE resources SET sort = ? WHERE id = ?')
    payload.orderedIds.forEach((id, index) => update.run(index, id))
    touchCharacter(db, character.id)

    return { characterId: character.id, orderedIds: payload.orderedIds }
  },
}
