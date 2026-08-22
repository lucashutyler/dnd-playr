import {
  clampResource,
  requireClaimed,
  requireResource,
  touchCharacter,
} from '../characters/store.js'
import { isCount, isId, isText, NAME_MAX, RESETS_ON } from './validators.js'

/** Rename a track, set its max, or change when it comes back. */
export default {
  type: 'resource.update',

  validate(payload) {
    if (!isId(payload.resourceId)) return 'invalid_payload'

    const keys = Object.keys(payload).filter((k) => k !== 'resourceId')
    if (keys.length === 0) return 'invalid_payload'

    for (const key of keys) {
      if (key === 'name' && !isText(payload.name, NAME_MAX)) return 'invalid_payload'
      else if (key === 'max' && !isCount(payload.max, { max: 999 })) return 'invalid_payload'
      else if (key === 'resetsOn' && !RESETS_ON.includes(payload.resetsOn)) return 'invalid_payload'
      else if (!['name', 'max', 'resetsOn'].includes(key)) return 'invalid_payload'
    }
    return null
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)
    const resource = requireResource(db, character.id, payload.resourceId)

    const name = payload.name === undefined ? resource.name : payload.name.trim()
    const max = payload.max === undefined ? resource.max : payload.max
    const resetsOn = payload.resetsOn ?? resource.resets_on

    // Giving an untracked row a max for the first time fills it, the same way
    // adding a track does: you are recording what you have, not spending it.
    // Otherwise, dropping the max must not leave more in it than it can hold.
    const current = resource.max === 0 && max > 0 ? max : clampResource(resource.current, max)

    db.prepare(
      'UPDATE resources SET name = ?, max = ?, current = ?, resets_on = ? WHERE id = ?',
    ).run(name, max, current, resetsOn, resource.id)
    touchCharacter(db, character.id)

    return { characterId: character.id, resourceId: resource.id, name, max, resetsOn }
  },
}
