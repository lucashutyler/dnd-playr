import { publicSession } from './rooms/store.js'
import { hitsBySession } from './enemies/store.js'

/**
 * One query set in, one JSON blob out. This is the entire wire format: the
 * server never sends a patch, and the client never merges. See CLAUDE.md.
 *
 * Characters and enemies are empty until Phases 3 and 4, but they are in the
 * shape from the start so the client never has to grow a new branch.
 */
export function buildSnapshot(db, sessionId, { onlineMemberIds = new Set() } = {}) {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
  if (!session) return null

  const members = db
    .prepare('SELECT * FROM members WHERE session_id = ? ORDER BY created_at, id')
    .all(sessionId)

  const characters = db
    .prepare('SELECT * FROM characters WHERE session_id = ? ORDER BY sort, created_at')
    .all(sessionId)

  const resources = db
    .prepare(
      `SELECT r.* FROM resources r
       JOIN characters c ON c.id = r.character_id
       WHERE c.session_id = ?
       ORDER BY r.sort, r.rowid`,
    )
    .all(sessionId)

  // Archived enemies belong to a finished encounter and are out of the way.
  // Defeated ones stay on the list but sink below whatever is still standing.
  const enemies = db
    .prepare(
      `SELECT * FROM enemies
       WHERE session_id = ? AND archived_at IS NULL
       ORDER BY (status = 'active') DESC, sort, created_at`,
    )
    .all(sessionId)

  const hits = hitsBySession(db, sessionId)

  const byCharacter = new Map()
  for (const row of resources) {
    if (!byCharacter.has(row.character_id)) byCharacter.set(row.character_id, [])
    byCharacter.get(row.character_id).push({
      id: row.id,
      name: row.name,
      current: row.current,
      max: row.max,
      resetsOn: row.resets_on,
    })
  }

  return {
    session: publicSession(session, { memberCount: members.length }),
    members: members.map((m) => ({
      id: m.id,
      displayName: m.display_name,
      characterId: m.character_id,
      // Presence is derived from live sockets and never stored.
      online: onlineMemberIds.has(m.id),
    })),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      class: c.class,
      level: c.level,
      hp: { current: c.hp_current, max: c.hp_max, temp: c.hp_temp },
      ac: c.ac,
      deathSaves: { successes: c.death_success, failures: c.death_failure },
      conditions: safeJson(c.conditions, []),
      notes: c.notes,
      resources: byCharacter.get(c.id) ?? [],
    })),
    enemies: enemies.map((e) => ({
      id: e.id,
      label: e.label,
      // No hp_max, no hp_current. Only what the party has done to it.
      damageTotal: e.damage_total,
      status: e.status,
      // Every hit, in order, straight from the event log. Only the current
      // encounter's enemies are here, so this stays a handful of rows.
      hits: hits.get(e.id) ?? [],
    })),
  }
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
