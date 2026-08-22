import { createCharacter, claim } from '../characters/store.js'
import { CLASS_NAMES } from '../characters/presets.js'
import { isCount, isText, NAME_MAX } from './validators.js'

/** Rolls a new character and hands it to whoever asked. */
export default {
  type: 'character.create',

  validate(payload) {
    if (!isText(payload.name, NAME_MAX)) return 'invalid_payload'
    if (payload.class !== undefined && !CLASS_NAMES.includes(payload.class)) return 'unknown_class'
    if (payload.level !== undefined && !isCount(payload.level, { min: 1, max: 20 })) {
      return 'invalid_payload'
    }
    return null
  },

  apply({ db, session, member, payload }) {
    const className = payload.class ?? 'Other'
    const level = payload.level ?? 1

    const characterId = createCharacter(db, session.id, {
      name: payload.name.trim(),
      className,
      level,
    })
    claim(db, member.id, characterId)

    return { characterId, name: payload.name.trim(), class: className, level }
  },
}
