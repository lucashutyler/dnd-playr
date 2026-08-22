import { randomUUID } from 'node:crypto'
import { IntentError } from '../errors.js'

const now = () => new Date().toISOString()

/** Enemies are addressed within a room, and archived ones are out of play. */
export function requireEnemy(db, sessionId, enemyId) {
  const enemy = db
    .prepare('SELECT * FROM enemies WHERE id = ? AND session_id = ? AND archived_at IS NULL')
    .get(enemyId, sessionId)
  if (!enemy) throw new IntentError('no_such_enemy')
  return enemy
}

export function createEnemy(db, sessionId, label) {
  const sort =
    db
      .prepare(
        `SELECT COALESCE(MAX(sort), -1) + 1 FROM enemies
         WHERE session_id = ? AND archived_at IS NULL`,
      )
      .pluck()
      .get(sessionId) ?? 0

  const id = randomUUID()
  db.prepare(
    `INSERT INTO enemies (id, session_id, label, damage_total, status, sort, created_at)
     VALUES (?, ?, ?, 0, 'active', ?, ?)`,
  ).run(id, sessionId, label, sort, now())
  return id
}

/**
 * Applies a signed entry to the tally. Positive is damage the party dealt,
 * negative is the thing being healed in front of them.
 *
 * The tally is not clamped. It is exactly the sum of its entries, so the
 * history a player taps into always adds up to the number printed above it.
 */
export function applyDelta(db, enemy, delta) {
  const total = enemy.damage_total + delta
  db.prepare('UPDATE enemies SET damage_total = ? WHERE id = ?').run(total, enemy.id)
  return total
}

/**
 * Every hit on every enemy in this room, oldest first, read straight out of
 * the event log. Attribution lives there and nowhere else, so the tally and
 * the history cannot drift apart.
 *
 * Undone hits are skipped. The event stays in the log — nothing is ever
 * rewritten — but a mis-tap that has been taken back should not sit in the
 * history arguing with the number above it.
 */
export function hitsBySession(db, sessionId) {
  const rows = db
    .prepare(
      `SELECT e.id,
              e.member_id,
              e.created_at,
              json_extract(e.payload, '$.enemyId') AS enemy_id,
              json_extract(e.payload, '$.delta')   AS delta
       FROM events e
       WHERE e.session_id = ?
         AND e.type IN ('enemy.damage', 'enemy.heal')
         AND e.id NOT IN (
           SELECT json_extract(u.payload, '$.revertedEventId')
           FROM events u
           WHERE u.session_id = ? AND u.type = 'history.undo'
         )
       ORDER BY e.id`,
    )
    .all(sessionId, sessionId)

  const byEnemy = new Map()
  for (const row of rows) {
    if (!byEnemy.has(row.enemy_id)) byEnemy.set(row.enemy_id, [])
    byEnemy.get(row.enemy_id).push({
      id: row.id,
      memberId: row.member_id,
      delta: row.delta,
      at: row.created_at,
    })
  }
  return byEnemy
}
