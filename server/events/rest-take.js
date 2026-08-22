import { requireClaimed, touchCharacter } from '../characters/store.js'

/**
 * A short rest gives back only what says it comes back on a short rest. A long
 * rest gives back both kinds, refills hit points, and drops temporary ones,
 * because temporary hit points do not survive the night.
 *
 * Hit dice are a track like any other, so spending them stays manual.
 */
export default {
  type: 'rest.take',

  validate(payload) {
    return payload.kind === 'short' || payload.kind === 'long' ? null : 'invalid_payload'
  },

  apply({ db, member, payload }) {
    const character = requireClaimed(db, member)
    const kinds = payload.kind === 'long' ? ['short', 'long'] : ['short']

    const restored = db
      .prepare(
        `UPDATE resources SET current = max
         WHERE character_id = ?
           AND resets_on IN (${kinds.map(() => '?').join(', ')})
           AND max > 0`,
      )
      .run(character.id, ...kinds).changes

    if (payload.kind === 'long') {
      db.prepare(
        `UPDATE characters
         SET hp_current = CASE WHEN hp_max > 0 THEN hp_max ELSE hp_current END,
             hp_temp = 0,
             death_success = 0,
             death_failure = 0
         WHERE id = ?`,
      ).run(character.id)
    }
    touchCharacter(db, character.id)

    return { characterId: character.id, kind: payload.kind, tracksRestored: restored }
  },
}
