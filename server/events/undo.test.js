import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { createMember, createSession, recordEvent } from '../rooms/store.js'
import { buildSnapshot } from '../snapshot.js'
import { findHandler } from './index.js'

let db
let session
let sam
let robin

beforeEach(() => {
  db = openDatabase(':memory:')
  session = createSession(db, { code: 'TEST', name: 'Tuesday Night' })
  sam = createMember(db, { sessionId: session.id, tokenHash: 'sam', displayName: 'Sam' })
  robin = createMember(db, { sessionId: session.id, tokenHash: 'robin', displayName: 'Robin' })
})

function run(type, payload = {}, who = 'sam') {
  const member = db
    .prepare('SELECT * FROM members WHERE id = ?')
    .get(who === 'sam' ? sam.id : robin.id)

  const handler = findHandler(type)
  const invalid = handler.validate(payload)
  if (invalid) return { error: invalid }

  try {
    const logged = handler.apply({ db, session, member, payload })
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

const undo = (who = 'sam') => run('history.undo', {}, who)
const snap = () => buildSnapshot(db, session.id)
const character = () => db.prepare('SELECT * FROM characters LIMIT 1').get()
const track = (name) => db.prepare('SELECT * FROM resources WHERE name = ? LIMIT 1').get(name)

function makeCharacter() {
  run('character.create', { name: 'Vex', class: 'Monk', level: 5 })
  run('character.update', { hpMax: 30 })
}

describe('undoing hit points', () => {
  beforeEach(makeCharacter)

  it('puts damage back, temp pool included', () => {
    run('character.update', { hpTemp: 5 })
    run('hp.damage', { amount: 8 })
    expect(character()).toMatchObject({ hp_current: 27, hp_temp: 0 })

    undo()
    // Both pools, not just the visible number.
    expect(character()).toMatchObject({ hp_current: 30, hp_temp: 5 })
  })

  it('puts healing back to where it actually was, not minus the amount', () => {
    run('hp.damage', { amount: 4 })
    run('hp.heal', { amount: 999 }) // capped at 30, so only 4 landed
    expect(character().hp_current).toBe(30)

    undo()
    expect(character().hp_current).toBe(26)
  })

  it('restores death saves that healing wiped', () => {
    run('hp.damage', { amount: 30 })
    run('death.set', { successes: 1, failures: 2 })
    run('hp.heal', { amount: 5 })
    expect(character()).toMatchObject({ death_success: 0, death_failure: 0 })

    undo()
    expect(character()).toMatchObject({ hp_current: 0, death_success: 1, death_failure: 2 })
  })
})

describe('undoing resources', () => {
  beforeEach(makeCharacter)

  it('lands back where it was even when the spend was clamped', () => {
    run('resource.update', { resourceId: track('Ki').id, max: 5 })
    run('resource.adjust', { resourceId: track('Ki').id, delta: -3 })
    expect(track('Ki').current).toBe(2)

    // Clamps at zero, so a naive +9 would overshoot.
    run('resource.adjust', { resourceId: track('Ki').id, delta: -9 })
    expect(track('Ki').current).toBe(0)

    undo()
    expect(track('Ki').current).toBe(2)
  })

  it('brings a removed track back whole', () => {
    run('resource.update', { resourceId: track('Ki').id, max: 5 })
    run('resource.adjust', { resourceId: track('Ki').id, delta: -2 })
    run('resource.remove', { resourceId: track('Ki').id })
    expect(track('Ki')).toBeUndefined()

    undo()
    expect(track('Ki')).toMatchObject({ current: 3, max: 5, resets_on: 'short' })
  })
})

describe('undoing the ledger', () => {
  const addEnemy = (label = 'Ogre') => run('enemy.add', { label }).logged.enemyId

  it('takes a hit back off the tally and out of the history', () => {
    const id = addEnemy()
    run('enemy.damage', { enemyId: id, amount: 7 })
    run('enemy.damage', { enemyId: id, amount: 12 })
    expect(snap().enemies[0].damageTotal).toBe(19)

    undo()
    const enemy = snap().enemies[0]
    expect(enemy.damageTotal).toBe(7)
    // The tally still equals the sum of what the history shows.
    expect(enemy.hits.reduce((n, h) => n + h.delta, 0)).toBe(7)
  })

  it('brings back a removed enemy with its tally and its hits', () => {
    const id = addEnemy('Big guy with the axe')
    run('enemy.damage', { enemyId: id, amount: 9 })
    run('enemy.remove', { enemyId: id })
    expect(snap().enemies).toHaveLength(0)

    undo()
    expect(snap().enemies[0]).toMatchObject({ label: 'Big guy with the axe', damageTotal: 9 })
    expect(snap().enemies[0].hits).toHaveLength(1)
  })

  it('unarchives a whole encounter in one go', () => {
    addEnemy('Ogre')
    addEnemy('Wolf')
    run('encounter.new')
    expect(snap().enemies).toHaveLength(0)

    undo()
    expect(snap().enemies.map((e) => e.label)).toEqual(['Ogre', 'Wolf'])
  })

  it('puts a status change back', () => {
    const id = addEnemy()
    run('enemy.update', { enemyId: id, status: 'defeated' })
    undo()
    expect(snap().enemies[0].status).toBe('active')
  })
})

describe('what undo will and will not take back', () => {
  it('walks past actions that have no inverse', () => {
    makeCharacter()
    const id = run('enemy.add', { label: 'Ogre' }).logged.enemyId
    run('enemy.damage', { enemyId: id, amount: 5 })
    // Renaming has no undo; it is quicker to type it again.
    run('session.rename', { name: 'Wednesday' })

    undo()
    expect(snap().enemies[0].damageTotal).toBe(0)
    expect(snap().session.name).toBe('Wednesday')
  })

  it('steps further back each time it is used', () => {
    const id = run('enemy.add', { label: 'Ogre' }).logged.enemyId
    run('enemy.damage', { enemyId: id, amount: 3 })
    run('enemy.damage', { enemyId: id, amount: 4 })
    run('enemy.damage', { enemyId: id, amount: 5 })
    expect(snap().enemies[0].damageTotal).toBe(12)

    undo()
    expect(snap().enemies[0].damageTotal).toBe(7)
    undo()
    expect(snap().enemies[0].damageTotal).toBe(3)
    undo()
    expect(snap().enemies[0].damageTotal).toBe(0)
  })

  it('only takes back your own actions', () => {
    const id = run('enemy.add', { label: 'Ogre' }).logged.enemyId
    run('enemy.damage', { enemyId: id, amount: 10 }, 'sam')
    run('enemy.damage', { enemyId: id, amount: 4 }, 'robin')

    // Robin undoes Robin's hit, not Sam's, even though Sam's is not the latest.
    undo('robin')
    expect(snap().enemies[0].damageTotal).toBe(10)

    undo('sam')
    expect(snap().enemies[0].damageTotal).toBe(0)
  })

  it('refuses when there is nothing of yours left to take back', () => {
    expect(undo().error).toBe('nothing_to_undo')

    run('session.rename', { name: 'Only a rename' })
    expect(undo().error).toBe('nothing_to_undo')
  })

  it('appends rather than rewriting, and never undoes the same thing twice', () => {
    const id = run('enemy.add', { label: 'Ogre' }).logged.enemyId
    run('enemy.damage', { enemyId: id, amount: 6 })

    const before = db.prepare('SELECT COUNT(*) FROM events').pluck().get()
    undo()
    const after = db.prepare('SELECT COUNT(*) FROM events').pluck().get()

    // The original hit is still on the record; the undo sits on top of it.
    expect(after).toBe(before + 1)
    expect(
      db.prepare("SELECT COUNT(*) FROM events WHERE type = 'enemy.damage'").pluck().get(),
    ).toBe(1)

    // A second undo moves on rather than reverting the same event again.
    expect(undo().error).toBe('nothing_to_undo')
    expect(snap().enemies[0].damageTotal).toBe(0)
  })
})
