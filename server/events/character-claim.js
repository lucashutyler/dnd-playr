import { findCharacter, claim } from '../characters/store.js'
import { isId } from './validators.js'

/**
 * Picks up a character that is already in the room. This is the normal way to
 * come back next week, and the normal way a second device joins — several
 * members pointing at one character is the design, not a clash.
 */
export default {
  type: 'character.claim',

  validate(payload) {
    return isId(payload.characterId) ? null : 'invalid_payload'
  },

  apply({ db, session, member, payload }) {
    const character = findCharacter(db, session.id, payload.characterId)
    if (!character) throw new Error('no such character in this room')

    claim(db, member.id, character.id)
    return { characterId: character.id, name: character.name }
  },
}
