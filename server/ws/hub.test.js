import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoom, makeLiveApp, wsClient } from '../test-helpers.js'

let ctx

beforeEach(async () => {
  ctx = await makeLiveApp()
})
afterEach(async () => {
  await ctx.close()
})

/** Connects and swallows the snapshot every new socket is greeted with. */
async function connected(token) {
  const client = wsClient(ctx.wsUrl, token)
  await client.open()
  const first = await client.next()
  return { client, first }
}

describe('upgrade', () => {
  it('accepts a valid token and greets it with a snapshot', async () => {
    const room = await createRoom(ctx.app, { name: 'Tuesday Night' })
    const { client, first } = await connected(room.token)

    expect(first.type).toBe('snapshot')
    expect(first.snapshot.session.code).toBe(room.session.code)
    expect(first.snapshot.session.name).toBe('Tuesday Night')
    expect(first.snapshot.members).toHaveLength(1)
    expect(first.snapshot.characters).toEqual([])
    expect(first.snapshot.enemies).toEqual([])

    await client.close()
  })

  it('refuses a missing or bogus token', async () => {
    expect(await wsClient(ctx.wsUrl, undefined).rejection()).toBe(401)
    expect(await wsClient(ctx.wsUrl, '').rejection()).toBe(401)
    expect(await wsClient(ctx.wsUrl, 'not-a-real-token').rejection()).toBe(401)
  })

  it('refuses any path but /ws', async () => {
    const room = await createRoom(ctx.app)
    const client = wsClient(`ws://127.0.0.1:${ctx.port}/nope`, room.token)
    expect(await client.rejection()).toBe(404)
  })

  it('never puts a hash or an internal id on the wire', async () => {
    const room = await createRoom(ctx.app, { passphrase: 'dragons' })
    const { client, first } = await connected(room.token)

    const wire = JSON.stringify(first)
    expect(wire).not.toMatch(/passphrase_hash|token_hash/)
    expect(first.snapshot.session.id).toBeUndefined()
    // Whether a passphrase exists is fine to know; the hash is not.
    expect(first.snapshot.session.hasPassphrase).toBe(true)

    await client.close()
  })
})

describe('intents', () => {
  it('applies, acks, logs an event, and broadcasts to everyone', async () => {
    const room = await createRoom(ctx.app, { name: 'Tuesday Night' })
    const joined = await ctx.app
      .inject({
        method: 'POST',
        url: `/api/sessions/${room.session.code}/join`,
        payload: { displayName: 'Robin' },
      })
      .then((r) => r.json())

    const a = await connected(room.token)
    const b = await connected(joined.token)
    // b arriving changed presence, so a gets a snapshot for that first.
    expect((await a.client.next()).snapshot.members).toHaveLength(2)

    b.client.send({ type: 'session.rename', name: 'Wednesday Night', id: 'i1' })

    const ack = await b.client.next()
    expect(ack).toEqual({ type: 'ack', id: 'i1' })

    // Both sockets see it, not just the one that sent it.
    for (const client of [a.client, b.client]) {
      const frame = await client.next()
      expect(frame.type).toBe('snapshot')
      expect(frame.snapshot.session.name).toBe('Wednesday Night')
    }

    const logged = ctx.db.prepare('SELECT type, payload FROM events ORDER BY id DESC').get()
    expect(logged.type).toBe('session.rename')
    expect(JSON.parse(logged.payload)).toEqual({ name: 'Wednesday Night' })

    await a.client.close()
    await b.client.close()
  })

  it('renames the sender without being told who that is', async () => {
    const room = await createRoom(ctx.app, { displayName: 'Sam' })
    const { client } = await connected(room.token)

    // No member id in the payload. The socket already knows.
    client.send({ type: 'member.rename', displayName: 'Samwise' })

    const frame = await client.next()
    expect(frame.snapshot.members[0].displayName).toBe('Samwise')
    expect(frame.snapshot.members[0].id).toBe(room.member.id)

    await client.close()
  })

  it('rejects junk without mutating anything', async () => {
    const room = await createRoom(ctx.app, { name: 'Tuesday Night' })
    const { client } = await connected(room.token)

    const cases = [
      [{ type: 'nope.nope', id: 'a' }, 'unknown_intent'],
      [{ type: 'session.rename', id: 'b' }, 'invalid_payload'],
      [{ type: 'session.rename', name: 'x'.repeat(61), id: 'c' }, 'name_too_long'],
      [{ id: 'd' }, 'bad_intent'],
    ]

    for (const [intent, error] of cases) {
      client.send(intent)
      expect(await client.next()).toEqual({ type: 'error', id: intent.id ?? null, error })
    }

    client.socket.send('this is not json')
    expect(await client.next()).toEqual({ type: 'error', id: null, error: 'bad_json' })

    const name = ctx.db.prepare('SELECT name FROM sessions').pluck().get()
    expect(name).toBe('Tuesday Night')
    expect(ctx.db.prepare('SELECT COUNT(*) FROM events').pluck().get()).toBe(2) // created + joined

    await client.close()
  })
})

describe('broadcast isolation', () => {
  it('does not leak one room into another', async () => {
    const roomA = await createRoom(ctx.app, { name: 'A' })
    const roomB = await createRoom(ctx.app, { name: 'B' })

    const a = await connected(roomA.token)
    const b = await connected(roomB.token)

    a.client.send({ type: 'session.rename', name: 'A renamed' })
    expect((await a.client.next()).snapshot.session.name).toBe('A renamed')

    // B should hear nothing at all.
    await expect(b.client.next(250)).rejects.toThrow(/timed out/)

    await a.client.close()
    await b.client.close()
  })
})

describe('presence', () => {
  it('is derived from live sockets and never stored', async () => {
    const room = await createRoom(ctx.app)
    const joined = await ctx.app
      .inject({ method: 'POST', url: `/api/sessions/${room.session.code}/join`, payload: {} })
      .then((r) => r.json())

    const a = await connected(room.token)
    expect(a.first.snapshot.members.filter((m) => m.online)).toHaveLength(1)

    const b = await connected(joined.token)
    expect(b.first.snapshot.members.every((m) => m.online)).toBe(true)

    // a is told about the arrival too.
    const arrival = await a.client.next()
    expect(arrival.snapshot.members.filter((m) => m.online)).toHaveLength(2)

    await b.client.close()

    const departure = await a.client.next()
    expect(departure.snapshot.members.filter((m) => m.online)).toHaveLength(1)
    expect(departure.snapshot.members).toHaveLength(2) // still seated, just offline

    // Nothing about presence is in the database.
    const columns = ctx.db
      .prepare('PRAGMA table_info(members)')
      .all()
      .map((c) => c.name)
    expect(columns).not.toContain('online')

    await a.client.close()
  })
})

describe('reconnect and resume', () => {
  it('picks the same member back up with the same token', async () => {
    const room = await createRoom(ctx.app, { displayName: 'Sam' })

    const first = await connected(room.token)
    first.client.send({ type: 'session.rename', name: 'Mid-session' })
    await first.client.next()
    await first.client.close()

    // The registry lets go of a closed socket rather than leaking it.
    const sessionId = ctx.db
      .prepare('SELECT id FROM sessions WHERE code = ?')
      .pluck()
      .get(room.session.code)
    for (let i = 0; ctx.app.hub.countSockets(sessionId) > 0 && i < 50; i += 1) {
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(ctx.app.hub.countSockets(sessionId)).toBe(0)

    // Same token, brand new socket. State survives the gap.
    const second = await connected(room.token)
    expect(second.first.snapshot.session.name).toBe('Mid-session')
    expect(second.first.snapshot.members[0].id).toBe(room.member.id)
    expect(second.first.snapshot.members[0].displayName).toBe('Sam')
    expect(second.first.snapshot.members[0].online).toBe(true)

    await second.client.close()
  })

  it('lets one member hold two sockets at once', async () => {
    const room = await createRoom(ctx.app)

    const phone = await connected(room.token)
    const tablet = await connected(room.token)

    // One member, two devices, one seat. Both see the room.
    expect(tablet.first.snapshot.members).toHaveLength(1)

    phone.client.send({ type: 'member.rename', displayName: 'Sam' })
    await phone.client.next()
    expect((await tablet.client.next()).snapshot.members[0].displayName).toBe('Sam')

    await phone.client.close()
    await tablet.client.close()
  })
})
