import { requireClaimed, touchCharacter } from '../characters/store.js'
import { CLASS_NAMES } from '../characters/presets.js'
import { isConditionList, isCount, isText, NAME_MAX, NOTE_MAX } from './validators.js'

/**
 * The slow-moving fields, all optional. HP current and temp are not here: they
 * move through hp.damage and hp.heal so the ordering rules stay in one place.
 */
const FIELDS = {
  name: { column: 'name', check: (v) => isText(v, NAME_MAX), cast: (v) => v.trim() },
  class: { column: 'class', check: (v) => CLASS_NAMES.includes(v) },
  level: { column: 'level', check: (v) => isCount(v, { min: 1, max: 20 }) },
  ac: { column: 'ac', check: (v) => isCount(v, { max: 99 }) },
  hpMax: { column: 'hp_max', check: (v) => isCount(v, { max: 9999 }) },
  hpTemp: { column: 'hp_temp', check: (v) => isCount(v, { max: 9999 }) },
  notes: { column: 'notes', check: (v) => typeof v === 'string' && v.length <= NOTE_MAX },
  conditions: {
    column: 'conditions',
    check: isConditionList,
    cast: (v) => JSON.stringify(v.map((c) => c.trim())),
  },
}

export default {
  type: 'character.update',

  validate(payload) {
    const keys = Object.keys(payload)
    if (keys.length === 0) return 'invalid_payload'

    for (const key of keys) {
      const field = FIELDS[key]
      if (!field) return 'invalid_payload'
      if (!field.check(payload[key])) return 'invalid_payload'
    }
    return null
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)

    const sets = []
    const values = []
    for (const [key, value] of Object.entries(payload)) {
      const field = FIELDS[key]
      sets.push(field.column + ' = ?')
      values.push(field.cast ? field.cast(value) : value)
    }

    db.prepare('UPDATE characters SET ' + sets.join(', ') + ' WHERE id = ?').run(
      ...values,
      character.id,
    )

    if (payload.hpMax !== undefined) {
      if (character.hp_max === 0 && payload.hpMax > 0) {
        // Filling in a max for the first time means you have that many, not zero.
        db.prepare('UPDATE characters SET hp_current = hp_max WHERE id = ?').run(character.id)
      } else {
        // Lowering the max must not leave someone sitting above it.
        db.prepare('UPDATE characters SET hp_current = MIN(hp_current, hp_max) WHERE id = ?').run(
          character.id,
        )
      }
    }
    touchCharacter(db, character.id)

    return { characterId: character.id, ...payload }
  },
}
