import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { createMember, createSession, recordEvent } from '../rooms/store.js'
import { verifyPassphrase } from '../auth/tokens.js'
import { buildSnapshot } from '../snapshot.js'
import { findHandler } from './index.js'
import { MAX_CHARACTERS, MAX_ENEMIES, MAX_RESOURCES } from './limits.js'

let db
let session
let member

beforeEach(() => {
  db = openDatabase(':memory:')
  session = createSession(db, { name: 'Tuesday Night' })
  member = createMember(db, { sessionId: session.id, tokenHash: 'sam', displayName: 'Sam' })
})

/** Mirrors the hub: validate, prepare outside the transaction, then apply. */
async function run(type, payload = {}) {
  const handler = findHandler(type)
  const invalid = handler.validate(payload)
  if (invalid) return { error: invalid }

  session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id)
  member = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id)

  let prepared
  try {
    if (handler.prepare) prepared = await handler.prepare(payload)
    const logged = handler.apply({ db, session, member, payload, prepared })
    recordEvent(db, {
      sessionId: session.id,
      memberId: member.id,
      type,
      payload: logged ?? payload,
    })
    return { logged }
  } catch (err) {
    return { error: err.code ?? 'threw' }
  }
}

const undo = () => run('history.undo', {})
const row = () => db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id)
const snap = () => buildSnapshot(db, session.id)
const eventText = () => JSON.stringify(db.prepare('SELECT type, payload FROM events').all())

describe('session.passphrase', () => {
  it('sets one that actually verifies', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })

    const stored = row().passphrase_hash
    expect(stored).toMatch(/^\$argon2id\$/)
    expect(await verifyPassphrase('dragons', stored)).toBe(true)
    expect(await verifyPassphrase('wrong', stored)).toBe(false)
    expect(snap().session.hasPassphrase).toBe(true)
  })

  it('changes one that was already set', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.passphrase', { passphrase: 'wyverns' })

    const stored = row().passphrase_hash
    expect(await verifyPassphrase('wyverns', stored)).toBe(true)
    expect(await verifyPassphrase('dragons', stored)).toBe(false)
  })

  it('clears one with null', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.passphrase', { passphrase: null })

    expect(row().passphrase_hash).toBeNull()
    expect(snap().session.hasPassphrase).toBe(false)
  })

  it('never writes the passphrase or its hash into the event log', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })

    const logged = eventText()
    expect(logged).not.toContain('dragons')
    expect(logged).not.toContain('argon2')
    expect(logged).toContain('hasPassphrase')
  })

  it('refuses something too short to be worth hashing', async () => {
    expect((await run('session.passphrase', { passphrase: 'ab' })).error).toBe(
      'passphrase_too_short',
    )
    expect((await run('session.passphrase', {})).error).toBe('invalid_payload')
    expect((await run('session.passphrase', { passphrase: 12 })).error).toBe('invalid_payload')
  })
})

describe('session.slug', () => {
  it('will not take a custom link on a room with no passphrase', async () => {
    // A name somebody chose is the first thing anyone would try, so it is only
    // allowed once there is a passphrase actually holding the door.
    expect((await run('session.slug', { slug: 'samsroom' })).error).toBe('slug_needs_passphrase')
    expect(row().slug).toBeNull()
  })

  it('takes one once a passphrase is set', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'SamsRoom' })

    // Stored lowercase, so the link is the link however it was typed.
    expect(row().slug).toBe('samsroom')
    expect(snap().session.slug).toBe('samsroom')
  })

  it('will not take one somebody else already has', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'samsroom' })

    const other = createSession(db, { name: 'Another table' })
    const otherMember = createMember(db, { sessionId: other.id, tokenHash: 'other' })
    const handler = findHandler('session.slug')

    db.prepare('UPDATE sessions SET passphrase_hash = ? WHERE id = ?').run('x', other.id)
    const fresh = db.prepare('SELECT * FROM sessions WHERE id = ?').get(other.id)

    expect(() =>
      handler.apply({ db, session: fresh, member: otherMember, payload: { slug: 'samsroom' } }),
    ).toThrow(/slug_taken/)
  })

  it('leaves a room free to keep its own link', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'samsroom' })
    // Re-claiming the same one is not a collision with itself.
    expect((await run('session.slug', { slug: 'samsroom' })).error).toBeUndefined()
  })

  it('refuses names that would collide with the app or read as broken', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })

    for (const reserved of ['api', 'ws', 'room', 'c', 'assets']) {
      expect((await run('session.slug', { slug: reserved })).error).toBe('slug_reserved')
    }
    for (const bad of ['ab', '-nope', 'nope-', 'two--hyphens', 'Spaces Here', 'punct!']) {
      expect((await run('session.slug', { slug: bad })).error).toBe('slug_invalid')
    }
  })

  it('releases with null, and can be taken back', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'samsroom' })

    await run('session.slug', { slug: null })
    expect(row().slug).toBeNull()

    await undo()
    expect(row().slug).toBe('samsroom')
  })

  it('will not let the passphrase be cleared while a custom link depends on it', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'samsroom' })

    expect((await run('session.passphrase', { passphrase: null })).error).toBe(
      'slug_needs_passphrase',
    )
    expect(row().passphrase_hash).toBeTruthy()

    // Dropping the link first is the way out.
    await run('session.slug', { slug: null })
    expect((await run('session.passphrase', { passphrase: null })).error).toBeUndefined()
  })
})

describe('a room has three separate things', () => {
  // The name is what the table calls itself. The link id is generated. The
  // custom link is a name for the URL. None of them is derived from another,
  // and changing one must never move the others.
  it('keeps the display name clear of both links', async () => {
    await run('session.rename', { name: 'Awesome D&D Party' })
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'mycustomlink' })

    const after = row()
    expect(after.name).toBe('Awesome D&D Party')
    expect(after.slug).toBe('mycustomlink')
    // Generated, and nothing to do with either.
    expect(after.url_id).not.toBe('mycustomlink')
    expect(after.url_id).not.toContain('awesome')
    expect(after.url_id).toMatch(/^[a-z0-9]{4,16}$/)

    const shown = snap().session
    expect(shown).toMatchObject({
      name: 'Awesome D&D Party',
      slug: 'mycustomlink',
      urlId: after.url_id,
    })
  })

  it('renaming the room leaves both links alone', async () => {
    await run('session.passphrase', { passphrase: 'dragons' })
    await run('session.slug', { slug: 'mycustomlink' })
    const before = row()

    await run('session.rename', { name: 'Completely Different Party' })

    const after = row()
    expect(after.name).toBe('Completely Different Party')
    expect(after.slug).toBe(before.slug)
    expect(after.url_id).toBe(before.url_id)
  })

  it('claiming or releasing a custom link leaves the name alone', async () => {
    await run('session.rename', { name: 'Awesome D&D Party' })
    await run('session.passphrase', { passphrase: 'dragons' })
    const urlId = row().url_id

    await run('session.slug', { slug: 'mycustomlink' })
    expect(row().name).toBe('Awesome D&D Party')

    await run('session.slug', { slug: 'somethingelse' })
    expect(row().name).toBe('Awesome D&D Party')

    await run('session.slug', { slug: null })
    expect(row()).toMatchObject({ name: 'Awesome D&D Party', slug: null, url_id: urlId })
  })

  it('lets two rooms share a display name, which links can never do', async () => {
    await run('session.rename', { name: 'Awesome D&D Party' })

    // A name is a label, not an identifier. Nothing stops another table
    // picking the same one.
    const other = createSession(db, { name: 'Awesome D&D Party' })
    expect(other.name).toBe(row().name)
    expect(other.url_id).not.toBe(row().url_id)
  })
})

describe('session.lock', () => {
  it('locks and unlocks, and shows up in the snapshot', async () => {
    await run('session.lock', { locked: true })
    expect(snap().session.locked).toBe(true)

    await run('session.lock', { locked: false })
    expect(snap().session.locked).toBe(false)
  })

  it('can be taken back', async () => {
    await run('session.lock', { locked: true })
    await undo()
    expect(snap().session.locked).toBe(false)
  })

  it('rejects anything that is not a boolean', async () => {
    expect((await run('session.lock', { locked: 'yes' })).error).toBe('invalid_payload')
  })
})

describe('session.archive', () => {
  it('closes the room without touching anything in it', async () => {
    await run('character.create', { name: 'Vex' })
    await run('enemy.add', { label: 'Ogre' })

    await run('session.archive', { archived: true })

    expect(row().archived_at).toBeTruthy()
    expect(snap().session.archived).toBe(true)
    // Nothing was destroyed; it is only out of use.
    expect(snap().characters).toHaveLength(1)
    expect(snap().enemies).toHaveLength(1)
  })

  it('reopens, and can be taken back', async () => {
    await run('session.archive', { archived: true })
    await run('session.archive', { archived: false })
    expect(row().archived_at).toBeNull()

    await run('session.archive', { archived: true })
    await undo()
    expect(row().archived_at).toBeNull()
  })

  it('refuses a change that would change nothing', async () => {
    expect((await run('session.archive', { archived: false })).error).toBe('no_change')
    await run('session.archive', { archived: true })
    expect((await run('session.archive', { archived: true })).error).toBe('no_change')
  })
})

describe('ceilings', () => {
  it('stops a room filling up with characters', async () => {
    for (let i = 0; i < MAX_CHARACTERS; i += 1) {
      await run('character.create', { name: 'Extra ' + i })
    }
    expect((await run('character.create', { name: 'One too many' })).error).toBe(
      'too_many_characters',
    )
  })

  it('stops a runaway client filling the ledger', async () => {
    for (let i = 0; i < MAX_ENEMIES; i += 1) {
      await run('enemy.add', { label: 'Goblin ' + i })
    }
    expect((await run('enemy.add', { label: 'One too many' })).error).toBe('too_many_enemies')
  })

  it('stops one character growing unlimited tracks', async () => {
    await run('character.create', { name: 'Vex', class: 'Wizard', level: 20 })
    const existing = db.prepare('SELECT COUNT(*) FROM resources').pluck().get()

    for (let i = existing; i < MAX_RESOURCES; i += 1) {
      await run('resource.add', { name: 'Track ' + i })
    }
    expect((await run('resource.add', { name: 'One too many' })).error).toBe('too_many_resources')
  })

  it('lets an archived encounter free the ledger up again', async () => {
    for (let i = 0; i < MAX_ENEMIES; i += 1) {
      await run('enemy.add', { label: 'Goblin ' + i })
    }
    await run('encounter.new')

    // Archiving is what clears the board, so the next fight starts with room.
    expect((await run('enemy.add', { label: 'Next encounter' })).logged.label).toBe(
      'Next encounter',
    )
  })
})
