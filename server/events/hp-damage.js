import { requireClaimed, touchCharacter } from '../characters/store.js'
import { isCount } from './validators.js'

/**
 * Damage eats temporary hit points first, then real ones, and stops at zero.
 * Getting this order right once here is why it is not in the UI.
 */
export default {
  type: 'hp.damage',

  validate(payload) {
    return isCount(payload.amount, { min: 1 }) ? null : 'invalid_payload'
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)
    const { amount } = payload

    const absorbed = Math.min(character.hp_temp, amount)
    const hpTemp = character.hp_temp - absorbed
    const hpCurrent = Math.max(0, character.hp_current - (amount - absorbed))

    db.prepare('UPDATE characters SET hp_current = ?, hp_temp = ? WHERE id = ?').run(
      hpCurrent,
      hpTemp,
      character.id,
    )
    touchCharacter(db, character.id)

    return { characterId: character.id, amount, absorbedByTemp: absorbed, hpCurrent, hpTemp }
  },
}
