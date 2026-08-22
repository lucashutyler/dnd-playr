const MAX = 40

/**
 * Renames the sender. The client never says which member it is — the socket
 * already knows, so there is no id in the payload to forge.
 */
export default {
  type: 'member.rename',

  validate(payload) {
    if (typeof payload.displayName !== 'string') return 'invalid_payload'
    if (payload.displayName.trim().length > MAX) return 'name_too_long'
    return null
  },

  apply({ db, member, payload }) {
    const displayName = payload.displayName.trim()
    db.prepare('UPDATE members SET display_name = ? WHERE id = ?').run(displayName, member.id)
    return { displayName }
  },
}
