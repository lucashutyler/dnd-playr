import { addResource, requireClaimed, touchCharacter } from '../characters/store.js'
import { isCount, isText, NAME_MAX, RESETS_ON } from './validators.js'
import { assertUnder, MAX_RESOURCES } from './limits.js'

/** Any spendable thing: a slot level, a class feature, somebody's homebrew. */
export default {
  type: 'resource.add',

  validate(payload) {
    if (!isText(payload.name, NAME_MAX)) return 'invalid_payload'
    if (payload.max !== undefined && !isCount(payload.max, { max: 999 })) return 'invalid_payload'
    if (payload.resetsOn !== undefined && !RESETS_ON.includes(payload.resetsOn)) {
      return 'invalid_payload'
    }
    return null
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)
    assertUnder(db, {
      sql: 'SELECT COUNT(*) FROM resources WHERE character_id = ?',
      args: [character.id],
      max: MAX_RESOURCES,
      error: 'too_many_resources',
    })

    const max = payload.max ?? 0

    const resourceId = addResource(db, character.id, {
      name: payload.name.trim(),
      // A new track starts full: you add it because you have it.
      current: max,
      max,
      resetsOn: payload.resetsOn ?? 'long',
    })
    touchCharacter(db, character.id)

    return { characterId: character.id, resourceId, name: payload.name.trim(), max }
  },
}
