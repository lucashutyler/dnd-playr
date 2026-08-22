import { claim } from '../characters/store.js'

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
}
