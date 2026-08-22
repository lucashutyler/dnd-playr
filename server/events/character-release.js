import { claim } from '../characters/store.js'
import { IntentError } from '../errors.js'

/** Puts a character down without deleting it. The sheet stays in the room. */
export default {
  type: 'character.release',

  validate() {
    return null
  },

  apply({ db, member }) {
    const released = member.character_id
    claim(db, member.id, null)
    return { characterId: released }
  },

  undo({ db, member, logged }) {
    if (!logged.characterId) throw new IntentError('nothing_to_undo')
    claim(db, member.id, logged.characterId)
    return { characterId: logged.characterId }
  },
}
