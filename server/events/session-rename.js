const MAX = 60

/** Renames the room. Anyone seated may do this; authorization stopped at the door. */
export default {
  type: 'session.rename',

  validate(payload) {
    if (typeof payload.name !== 'string') return 'invalid_payload'
    if (payload.name.trim().length > MAX) return 'name_too_long'
    return null
  },

  apply({ db, session, payload }) {
    const name = payload.name.trim()
    db.prepare('UPDATE sessions SET name = ?, updated_at = ? WHERE id = ?').run(
      name,
      new Date().toISOString(),
      session.id,
    )
    return { name }
  },
}
