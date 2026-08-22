import { randomUUID } from 'node:crypto'
import { tracksFor } from './presets.js'
import { IntentError } from '../errors.js'

const now = () => new Date().toISOString()

/** Characters are looked up within a room. There is no cross-room access. */
export function findCharacter(db, sessionId, characterId) {
  return (
    db
      .prepare('SELECT * FROM characters WHERE id = ? AND session_id = ?')
      .get(characterId, sessionId) ?? null
  )
}

/** The character this member has claimed, or null. Many members may claim one. */
export function claimedCharacter(db, member) {
  if (!member.character_id) return null
  return findCharacter(db, member.session_id, member.character_id)
}

export function claim(db, memberId, characterId) {
  db.prepare('UPDATE members SET character_id = ? WHERE id = ?').run(characterId, memberId)
}

export function touchCharacter(db, characterId) {
  db.prepare('UPDATE characters SET updated_at = ? WHERE id = ?').run(now(), characterId)
}

export function addResource(db, characterId, { name, current = 0, max = 0, resetsOn = 'long' }) {
  const sort =
    db
      .prepare('SELECT COALESCE(MAX(sort), -1) + 1 FROM resources WHERE character_id = ?')
      .pluck()
      .get(characterId) ?? 0

  const id = randomUUID()
  db.prepare(
    `INSERT INTO resources (id, character_id, name, current, max, resets_on, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, characterId, name, current, max, resetsOn, sort)
  return id
}

export function createCharacter(db, sessionId, { name, className = '', level = 1 }) {
  const at = now()
  const id = randomUUID()
  const sort =
    db
      .prepare('SELECT COALESCE(MAX(sort), -1) + 1 FROM characters WHERE session_id = ?')
      .pluck()
      .get(sessionId) ?? 0

  db.prepare(
    `INSERT INTO characters (id, session_id, name, class, level, sort, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, sessionId, name, className, level, sort, at, at)

  // Seed the tracks the class starts with. Values stay 0 for the player to fill.
  for (const track of tracksFor(className, level)) addResource(db, id, track)

  return id
}

/** The sender's character, or a clean refusal if they have not claimed one. */
export function requireClaimed(db, member) {
  const character = claimedCharacter(db, member)
  if (!character) throw new IntentError('no_character')
  return character
}

export function requireResource(db, characterId, resourceId) {
  const resource = db
    .prepare('SELECT * FROM resources WHERE id = ? AND character_id = ?')
    .get(resourceId, characterId)
  if (!resource) throw new IntentError('no_such_resource')
  return resource
}

/** A track with no max is untracked rather than empty, so it is not clamped down. */
export function clampResource(value, max) {
  const ceiling = max > 0 ? max : Number.MAX_SAFE_INTEGER
  return Math.max(0, Math.min(ceiling, value))
}
