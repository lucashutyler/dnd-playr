import { randomUUID } from 'node:crypto'

const now = () => new Date().toISOString()

/**
 * Serializers. The internal session id and every hash stay server-side —
 * clients address a room by its code and authenticate with their token.
 */
export function publicSession(session, { memberCount = 0 } = {}) {
  return {
    code: session.code,
    name: session.name,
    locked: Boolean(session.locked),
    archived: Boolean(session.archived_at),
    hasPassphrase: Boolean(session.passphrase_hash),
    createdAt: session.created_at,
    memberCount,
  }
}

export function publicMember(member) {
  return {
    id: member.id,
    displayName: member.display_name,
    characterId: member.character_id,
  }
}

export function createSession(db, { code, name = '', passphraseHash = null }) {
  const at = now()
  const session = {
    id: randomUUID(),
    code,
    name,
    passphrase_hash: passphraseHash,
    locked: 0,
    created_at: at,
    updated_at: at,
  }
  db.prepare(
    `INSERT INTO sessions (id, code, name, passphrase_hash, locked, created_at, updated_at)
     VALUES (@id, @code, @name, @passphrase_hash, @locked, @created_at, @updated_at)`,
  ).run(session)
  return session
}

export function findSessionByCode(db, code) {
  return db.prepare('SELECT * FROM sessions WHERE code = ?').get(code) ?? null
}

export function createMember(db, { sessionId, tokenHash, displayName = '' }) {
  const at = now()
  const member = {
    id: randomUUID(),
    session_id: sessionId,
    token_hash: tokenHash,
    character_id: null,
    display_name: displayName,
    created_at: at,
    last_seen_at: at,
  }
  db.prepare(
    `INSERT INTO members (id, session_id, token_hash, character_id, display_name, created_at, last_seen_at)
     VALUES (@id, @session_id, @token_hash, @character_id, @display_name, @created_at, @last_seen_at)`,
  ).run(member)
  return member
}

/** Resolves a bearer token to its member and room. The only identity path. */
export function findMemberByTokenHash(db, tokenHash) {
  const member = db.prepare('SELECT * FROM members WHERE token_hash = ?').get(tokenHash)
  if (!member) return null
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(member.session_id)
  if (!session) return null
  return { member, session }
}

export function touchMember(db, memberId) {
  db.prepare('UPDATE members SET last_seen_at = ? WHERE id = ?').run(now(), memberId)
}

export function countMembers(db, sessionId) {
  return db.prepare('SELECT COUNT(*) FROM members WHERE session_id = ?').pluck().get(sessionId)
}

/**
 * Append-only log. Phase 2 moves state mutations behind server/events/, but the
 * lifecycle moments worth auditing already belong here.
 */
export function recordEvent(db, { sessionId, memberId = null, type, payload = {} }) {
  db.prepare(
    `INSERT INTO events (session_id, member_id, type, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(sessionId, memberId, type, JSON.stringify(payload), now())
}
