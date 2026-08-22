import { requireClaimed, requireResource, touchCharacter } from '../characters/store.js'
import { isId } from './validators.js'

export default {
  type: 'resource.remove',

  validate(payload) {
    return isId(payload.resourceId) ? null : 'invalid_payload'
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)
    const resource = requireResource(db, character.id, payload.resourceId)

    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id)
    touchCharacter(db, character.id)

    // The event keeps enough to put it back, since undo is an inverse append.
    return {
      characterId: character.id,
      resourceId: resource.id,
      name: resource.name,
      current: resource.current,
      max: resource.max,
      resetsOn: resource.resets_on,
    }
  },
}
