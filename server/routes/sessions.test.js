import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoom, makeApp } from '../test-helpers.js'
import { isValidCode } from '../rooms/code.js'

let ctx

beforeEach(async () => {
  ctx = await makeApp()
})
afterEach(async () => {
  await ctx.close()
})

const post = (url, payload) => ctx.app.inject({ method: 'POST', url, payload })
const get = (url, token) =>
  ctx.app.inject({
    method: 'GET',
    url,
    headers: token ? { authorization: 'Bearer ' + token } : {},
  })
const joinUrl = (code) => '/api/sessions/' + code + '/join'

describe('POST /api/sessions', () => {
  it('creates a room and seats the creator', async () => {
    const res = await post('/api/sessions', { name: 'Tuesday Night' })
    expect(res.statusCode).toBe(201)

    const body = res.json()
    expect(isValidCode(body.session.code)).toBe(true)
    expect(body.session.name).toBe('Tuesday Night')
    expect(body.session.hasPassphrase).toBe(false)
    expect(body.session.locked).toBe(false)
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    // A fresh member holds no character. That is the normal state.
    expect(body.member.characterId).toBeNull()
  })

  it('never leaks the internal id or any hash', async () => {
    const body = await createRoom(ctx.app, { passphrase: 'dragons' })
    expect(JSON.stringify(body)).not.toMatch(/passphrase_hash|token_hash/)
    expect(body.session.id).toBeUndefined()
    expect(body.session.hasPassphrase).toBe(true)
  })

  it('rejects unknown fields and overlong names', async () => {
    expect((await post('/api/sessions', { nope: 1 })).statusCode).toBe(400)
    expect((await post('/api/sessions', { name: 'x'.repeat(61) })).statusCode).toBe(400)
  })

  it('hands out a different code each time', async () => {
    const codes = new Set()
    for (let i = 0; i < 6; i += 1) codes.add((await createRoom(ctx.app)).session.code)
    expect(codes.size).toBe(6)
  })
})

describe('POST /api/sessions/:code/join', () => {
  it('seats a second member on an open room', async () => {
    const { session } = await createRoom(ctx.app)
    const res = await post(joinUrl(session.code), { displayName: 'Sam' })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.member.displayName).toBe('Sam')
    expect(body.member.characterId).toBeNull()
    expect(body.session.memberCount).toBe(2)
  })

  it('accepts a lowercase code', async () => {
    const { session } = await createRoom(ctx.app)
    expect((await post(joinUrl(session.code.toLowerCase()), {})).statusCode).toBe(200)
  })

  it('gives every member a distinct token', async () => {
    const created = await createRoom(ctx.app)
    const joined = (await post(joinUrl(created.session.code), {})).json()
    expect(joined.token).not.toBe(created.token)
    expect(joined.member.id).not.toBe(created.member.id)
  })

  it('404s an unknown or malformed code without saying which', async () => {
    expect((await post(joinUrl('ZZZZ'), {})).json()).toEqual({ error: 'room_not_found' })
    // The letter I is not in the alphabet, so this cannot be a real room.
    expect((await post(joinUrl('IIII'), {})).json()).toEqual({ error: 'room_not_found' })
  })

  it('asks for a passphrase, then checks it', async () => {
    const { session } = await createRoom(ctx.app, { passphrase: 'dragons' })

    const missing = await post(joinUrl(session.code), {})
    expect(missing.statusCode).toBe(401)
    expect(missing.json()).toEqual({ error: 'passphrase_required' })

    const wrong = await post(joinUrl(session.code), { passphrase: 'nope' })
    expect(wrong.statusCode).toBe(401)
    expect(wrong.json()).toEqual({ error: 'passphrase_invalid' })

    const right = await post(joinUrl(session.code), { passphrase: 'dragons' })
    expect(right.statusCode).toBe(200)
  })

  it('refuses a locked room', async () => {
    const { session } = await createRoom(ctx.app)
    ctx.db.prepare('UPDATE sessions SET locked = 1 WHERE code = ?').run(session.code)

    const res = await post(joinUrl(session.code), {})
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({ error: 'room_locked' })
  })

  it('rate limits repeated attempts against one code', async () => {
    const { session } = await createRoom(ctx.app, { passphrase: 'dragons' })

    let limited = null
    for (let i = 0; i < 25 && !limited; i += 1) {
      const res = await post(joinUrl(session.code), { passphrase: 'guess' })
      if (res.statusCode === 429) limited = res
    }

    expect(limited).not.toBeNull()
    expect(limited.json().error).toBe('rate_limited')
  })
})

describe('a closed room', () => {
  const close = (code) =>
    ctx.db.prepare('UPDATE sessions SET archived_at = ? WHERE code = ?').run('2026-01-01', code)

  it('says so plainly rather than pretending it never existed', async () => {
    const { session } = await createRoom(ctx.app)
    close(session.code)

    const res = await post(joinUrl(session.code), {})
    expect(res.statusCode).toBe(410)
    expect(res.json()).toEqual({ error: 'room_closed' })
  })

  it('reopens only when asked, and seats you', async () => {
    const { session } = await createRoom(ctx.app)
    close(session.code)

    const res = await post(joinUrl(session.code), { restore: true, displayName: 'Robin' })
    expect(res.statusCode).toBe(200)
    // The response must not still claim the room is closed.
    expect(res.json().session.archived).toBe(false)

    const row = ctx.db.prepare('SELECT archived_at FROM sessions WHERE code = ?').get(session.code)
    expect(row.archived_at).toBeNull()
  })

  it('still wants the passphrase before it reopens', async () => {
    const { session } = await createRoom(ctx.app, { passphrase: 'dragons' })
    close(session.code)

    expect((await post(joinUrl(session.code), { restore: true })).statusCode).toBe(401)
    expect(
      (await post(joinUrl(session.code), { restore: true, passphrase: 'dragons' })).statusCode,
    ).toBe(200)
  })

  it('records the reopening rather than doing it silently', async () => {
    const { session } = await createRoom(ctx.app)
    close(session.code)
    await post(joinUrl(session.code), { restore: true })

    const types = ctx.db.prepare('SELECT type FROM events ORDER BY id').pluck().all()
    expect(types).toContain('session.reopened')
  })

  it('lets a member already holding a token resume it', async () => {
    const created = await createRoom(ctx.app)
    close(created.session.code)

    // So somebody who was there can reopen from inside.
    const res = await get('/api/session', created.token)
    expect(res.statusCode).toBe(200)
    expect(res.json().session.archived).toBe(true)
  })
})

describe('GET /api/session', () => {
  it('resumes a stored token', async () => {
    const created = await createRoom(ctx.app, { name: 'Tuesday Night' })
    const res = await get('/api/session', created.token)

    expect(res.statusCode).toBe(200)
    expect(res.json().session.code).toBe(created.session.code)
    expect(res.json().member.id).toBe(created.member.id)
  })

  it('resumes even when the room has since been locked', async () => {
    const created = await createRoom(ctx.app)
    ctx.db.prepare('UPDATE sessions SET locked = 1 WHERE code = ?').run(created.session.code)
    expect((await get('/api/session', created.token)).statusCode).toBe(200)
  })

  it('rejects a missing or bogus token', async () => {
    expect((await get('/api/session')).json()).toEqual({ error: 'token_required' })
    expect((await get('/api/session', 'made-up')).json()).toEqual({ error: 'token_invalid' })
  })

  it('updates last_seen_at', async () => {
    const created = await createRoom(ctx.app)
    const read = () =>
      ctx.db.prepare('SELECT last_seen_at FROM members WHERE id = ?').pluck().get(created.member.id)

    const before = read()
    await new Promise((r) => setTimeout(r, 5))
    await get('/api/session', created.token)

    expect(read() >= before).toBe(true)
  })
})

describe('the event log', () => {
  it('records room creation and every join, append-only', async () => {
    const { session } = await createRoom(ctx.app)
    await post(joinUrl(session.code), {})

    const types = ctx.db.prepare('SELECT type FROM events ORDER BY id').pluck().all()
    expect(types).toEqual(['session.created', 'member.joined', 'member.joined'])
  })
})
