import { requireClaimed, touchCharacter } from '../characters/store.js'
import { isCount } from './validators.js'

/**
 * Healing tops out at max, and never touches temporary hit points — those are
 * granted, not restored. Anything above zero clears the death saves.
 */
export default {
  type: 'hp.heal',

  validate(payload) {
    return isCount(payload.amount, { min: 1 }) ? null : 'invalid_payload'
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)

    // A character who has not filled in a max yet is untracked, not capped at 0.
    const cap = character.hp_max > 0 ? character.hp_max : Number.MAX_SAFE_INTEGER
    const hpCurrent = Math.min(cap, character.hp_current + payload.amount)
    const revived = hpCurrent > 0

    db.prepare(
      `UPDATE characters
       SET hp_current = ?,
           death_success = CASE WHEN ? THEN 0 ELSE death_success END,
           death_failure = CASE WHEN ? THEN 0 ELSE death_failure END
       WHERE id = ?`,
    ).run(hpCurrent, revived ? 1 : 0, revived ? 1 : 0, character.id)
    touchCharacter(db, character.id)

    return {
      characterId: character.id,
      amount: payload.amount,
      hpCurrent,
      clearedDeathSaves: revived,
      // Healing is capped, so how much actually landed is not derivable later.
      previousCurrent: character.hp_current,
      previousDeathSaves: {
        successes: character.death_success,
        failures: character.death_failure,
      },
    }
  },

  undo({ db, logged }) {
    const saves = logged.previousDeathSaves ?? { successes: 0, failures: 0 }
    db.prepare(
      'UPDATE characters SET hp_current = ?, death_success = ?, death_failure = ? WHERE id = ?',
    ).run(logged.previousCurrent, saves.successes, saves.failures, logged.characterId)
    return { hpCurrent: logged.previousCurrent }
  },
}
