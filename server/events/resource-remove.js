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
      sort: resource.sort,
    }
  },

  undo({ db, logged }) {
    db.prepare(
      `INSERT INTO resources (id, character_id, name, current, max, resets_on, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      logged.resourceId,
      logged.characterId,
      logged.name,
      logged.current,
      logged.max,
      logged.resetsOn,
      logged.sort ?? 0,
    )
    return { resourceId: logged.resourceId }
  },
}
