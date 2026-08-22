import {
  bearerFrom,
  createToken,
  hashPassphrase,
  hashToken,
  verifyPassphrase,
} from '../auth/tokens.js'
import { allocateCode, isValidCode, normalizeCode } from '../rooms/code.js'
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
  },
}

export default async function sessionRoutes(app) {
  const { db } = app

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
      const { displayName = '', passphrase } = request.body ?? {}

      if (!isValidCode(code)) {
        return reply.code(404).send({ error: 'room_not_found' })
      }

      const session = findSessionByCode(db, code)
      if (!session) {
        return reply.code(404).send({ error: 'room_not_found' })
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
      const member = db.transaction(() => {
        const seated = createMember(db, {
          sessionId: session.id,
          tokenHash: hashToken(token),
          displayName: displayName.trim(),
        })
        recordEvent(db, { sessionId: session.id, memberId: seated.id, type: 'member.joined' })
        return seated
      })()

      // A member with no character is the normal state right after joining.
      return reply.code(200).send({
        token,
        session: publicSession(session, { memberCount: countMembers(db, session.id) }),
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
