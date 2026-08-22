import { requireClaimed, touchCharacter } from '../characters/store.js'
import { isCount } from './validators.js'

/**
 * The whole death save state at once rather than increments, so two taps
 * racing each other cannot land on a number nobody chose.
 */
export default {
  type: 'death.set',

  validate(payload) {
    if (!isCount(payload.successes, { max: 3 })) return 'invalid_payload'
    if (!isCount(payload.failures, { max: 3 })) return 'invalid_payload'
    return null
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)

    db.prepare('UPDATE characters SET death_success = ?, death_failure = ? WHERE id = ?').run(
      payload.successes,
      payload.failures,
      character.id,
    )
    touchCharacter(db, character.id)

    return {
      characterId: character.id,
      successes: payload.successes,
      failures: payload.failures,
    }
  },
}
