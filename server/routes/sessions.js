import {
  bearerFrom,
  createToken,
  hashPassphrase,
  hashToken,
  verifyPassphrase,
} from '../auth/tokens.js'
import { allocateCode, isValidCode, normalizeCode } from '../rooms/code.js'
import { CLASS_NAMES } from '../characters/presets.js'
import {
  countMembers,
  createMember,
  createSession,
  findMemberByTokenHash,
  findSessionByCode,
  publicMember,
  publicSession,
  recordEvent,
  touchMember,
} from '../rooms/store.js'

const NAME_MAX = 60
const DISPLAY_NAME_MAX = 40
const PASSPHRASE_MAX = 200

const createBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: NAME_MAX },
    displayName: { type: 'string', maxLength: DISPLAY_NAME_MAX },
    passphrase: { type: 'string', minLength: 1, maxLength: PASSPHRASE_MAX },
  },
}

const joinBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayName: { type: 'string', maxLength: DISPLAY_NAME_MAX },
    passphrase: { type: 'string', maxLength: PASSPHRASE_MAX },
    // Opt-in reopening of a closed room, so nobody does it by accident.
    restore: { type: 'boolean' },
  },
}

export default async function sessionRoutes(app) {
  const { db } = app

  // The class list has one home, on the server, so the picker cannot drift.
  app.get('/api/meta', async () => ({ classes: CLASS_NAMES }))

  /** Creates a room and seats the creator. No host role — see CLAUDE.md. */
  app.post(
    '/api/sessions',
    {
      schema: { body: createBody },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { name = '', displayName = '', passphrase } = request.body ?? {}

      const passphraseHash = passphrase ? await hashPassphrase(passphrase) : null
      const token = createToken()

      const result = db.transaction(() => {
        const session = createSession(db, {
          code: allocateCode(db),
          name: name.trim(),
          passphraseHash,
        })
        const member = createMember(db, {
          sessionId: session.id,
          tokenHash: hashToken(token),
          displayName: displayName.trim(),
        })
        recordEvent(db, { sessionId: session.id, memberId: member.id, type: 'session.created' })
        recordEvent(db, { sessionId: session.id, memberId: member.id, type: 'member.joined' })
        return { session, member }
      })()

      request.log.info({ code: result.session.code }, 'room created')

      return reply.code(201).send({
        token,
        session: publicSession(result.session, { memberCount: 1 }),
        member: publicMember(result.member),
      })
    },
  )

  /**
   * Joins an existing room. Rate limited per code: a 4-letter code is
   * brute-forceable, and this makes enumeration boring.
   */
  app.post(
    '/api/sessions/:code/join',
    {
      schema: {
        body: joinBody,
        params: { type: 'object', properties: { code: { type: 'string', maxLength: 12 } } },
      },
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
          keyGenerator: (request) => `join:${normalizeCode(request.params.code)}`,
        },
      },
    },
    async (request, reply) => {
      const code = normalizeCode(request.params.code)
      const { displayName = '', passphrase, restore = false } = request.body ?? {}

      if (!isValidCode(code)) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      const session = findSessionByCode(db, code)
      if (!session) {
        return reply.code(404).send({ error: 'room_not_found' })
      }
      // A closed room says so plainly, and reopening has to be asked for.
      if (session.archived_at && !restore) {
        return reply.code(410).send({ error: 'room_closed' })
      }
      if (session.locked) {
        return reply.code(403).send({ error: 'room_locked' })
      }

      if (session.passphrase_hash) {
        if (!passphrase) {
          // The client shows its passphrase field in response to this.
          return reply.code(401).send({ error: 'passphrase_required' })
        }
        if (!(await verifyPassphrase(passphrase, session.passphrase_hash))) {
          return reply.code(401).send({ error: 'passphrase_invalid' })
        }
      }

      const token = createToken()
      const reopening = Boolean(session.archived_at)

      const member = db.transaction(() => {
        if (reopening) {
          db.prepare('UPDATE sessions SET archived_at = NULL, updated_at = ? WHERE id = ?').run(
            new Date().toISOString(),
            session.id,
          )
        }
        const seated = createMember(db, {
          sessionId: session.id,
          tokenHash: hashToken(token),
          displayName: displayName.trim(),
        })
        if (reopening) {
          recordEvent(db, { sessionId: session.id, memberId: seated.id, type: 'session.reopened' })
        }
        recordEvent(db, { sessionId: session.id, memberId: seated.id, type: 'member.joined' })
        return seated
      })()

      // Re-read so the response does not still claim the room is closed.
      const fresh = findSessionByCode(db, code)

      // A member with no character is the normal state right after joining.
      return reply.code(200).send({
        token,
        session: publicSession(fresh ?? session, {
          memberCount: countMembers(db, session.id),
        }),
        member: publicMember(member),
      })
    },
  )

  /** Resumes a stored token on page load. Works even if the room is locked. */
  app.get('/api/session', async (request, reply) => {
    const token = bearerFrom(request)
    if (!token) return reply.code(401).send({ error: 'token_required' })

    const found = findMemberByTokenHash(db, hashToken(token))
    if (!found) return reply.code(401).send({ error: 'token_invalid' })

    touchMember(db, found.member.id)
    return reply.send({
      session: publicSession(found.session, {
        memberCount: countMembers(db, found.session.id),
      }),
      member: publicMember(found.member),
    })
  })
}
