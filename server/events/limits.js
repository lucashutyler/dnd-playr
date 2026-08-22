import { IntentError } from '../errors.js'

/**
 * Ceilings on how much one room can hold.
 *
 * Authorization stops at the room door, so these are not defences against the
 * people at your table — they are a backstop against a stuck finger or a
 * looping client turning a session into something nobody can load.
 */
export const MAX_CHARACTERS = 50
export const MAX_ENEMIES = 200
export const MAX_RESOURCES = 64

export function assertUnder(db, { sql, args, max, error }) {
  const count = db
    .prepare(sql)
    .pluck()
    .get(...args)
  if (count >= max) throw new IntentError(error)
}
