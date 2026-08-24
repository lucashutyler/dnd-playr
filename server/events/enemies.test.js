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
  session = createSession(db, { name: 'Tuesday Night' })
  sam = createMember(db, { sessionId: session.id, tokenHash: 'sam', displayName: 'Sam' })
  robin = createMember(db, { sessionId: session.id, tokenHash: 'robin', displayName: 'Robin' })
})

/** Runs an intent the way the hub does, including the event log append. */
function run(type, payload = {}, member = sam) {
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

const snapshot = () => buildSnapshot(db, session.id)
const enemies = () => snapshot().enemies
const first = () => enemies()[0]

function addEnemy(label = 'Big guy with the axe') {
  return run('enemy.add', { label }).logged.enemyId
}

describe('enemy.add', () => {
  it('takes whatever the table is calling it', () => {
    addEnemy('Big guy with the axe')
    expect(first()).toMatchObject({
      label: 'Big guy with the axe',
      damageTotal: 0,
      status: 'active',
    })
  })

  it('never grows an hp field', () => {
    addEnemy()
    expect(Object.keys(first())).toEqual(['id', 'label', 'damageTotal', 'status', 'hits'])
  })

  it('refuses a blank label', () => {
    expect(run('enemy.add', { label: '   ' }).error).toBe('invalid_payload')
  })
})

describe('the tally', () => {
  it('counts up, and says who', () => {
    const id = addEnemy()
    run('enemy.damage', { enemyId: id, amount: 7 }, sam)
    run('enemy.damage', { enemyId: id, amount: 12 }, robin)

    expect(first().damageTotal).toBe(19)
    expect(first().hits.map((h) => [h.memberId, h.delta])).toEqual([
      [sam.id, 7],
      [robin.id, 12],
    ])
  })

  it('comes back down when the thing gets healed', () => {
    const id = addEnemy()
    run('enemy.damage', { enemyId: id, amount: 20 })
    run('enemy.heal', { enemyId: id, amount: 8 })

    expect(first().damageTotal).toBe(12)
    expect(first().hits.map((h) => h.delta)).toEqual([20, -8])
  })

  it('always equals the sum of its own history', () => {
    const id = addEnemy()
    const amounts = [3, 9, -4, 15, -2, 6]
    for (const n of amounts) {
      if (n > 0) run('enemy.damage', { enemyId: id, amount: n })
      else run('enemy.heal', { enemyId: id, amount: -n })
    }

    const enemy = first()
    const summed = enemy.hits.reduce((total, h) => total + h.delta, 0)
    expect(summed).toBe(enemy.damageTotal)
    expect(enemy.damageTotal).toBe(27)
  })

  it('is honest rather than clamped if healing outruns the party', () => {
    const id = addEnemy()
    run('enemy.damage', { enemyId: id, amount: 5 })
    run('enemy.heal', { enemyId: id, amount: 12 })

    // Odd to look at, but it still adds up, which is the property that matters.
    expect(first().damageTotal).toBe(-7)
  })

  it('keeps each enemy to its own ledger', () => {
    const ogre = addEnemy('Ogre')
    const wolf = addEnemy('Wolf')
    run('enemy.damage', { enemyId: ogre, amount: 10 })
    run('enemy.damage', { enemyId: wolf, amount: 3 })

    const list = enemies()
    expect(list.find((e) => e.id === ogre).damageTotal).toBe(10)
    expect(list.find((e) => e.id === wolf).damageTotal).toBe(3)
    expect(list.find((e) => e.id === wolf).hits).toHaveLength(1)
  })

  it('refuses damage to an enemy that is not in this room', () => {
    expect(run('enemy.damage', { enemyId: 'made-up', amount: 5 }).error).toBe('no_such_enemy')
    expect(run('enemy.damage', { enemyId: addEnemy(), amount: 0 }).error).toBe('invalid_payload')
  })
})

describe('enemy.update', () => {
  it('renames without disturbing the tally', () => {
    const id = addEnemy('big guy')
    run('enemy.damage', { enemyId: id, amount: 9 })
    run('enemy.update', { enemyId: id, label: 'Ogre chieftain' })

    expect(first()).toMatchObject({ label: 'Ogre chieftain', damageTotal: 9 })
  })

  it('sinks the defeated below whatever is still standing', () => {
    const ogre = addEnemy('Ogre')
    addEnemy('Wolf')
    addEnemy('Goblin')

    run('enemy.update', { enemyId: ogre, status: 'defeated' })

    // Still on the list, just out of the way.
    expect(enemies().map((e) => e.label)).toEqual(['Wolf', 'Goblin', 'Ogre'])
    expect(enemies().at(-1).status).toBe('defeated')
  })

  it('rejects an invented status', () => {
    expect(run('enemy.update', { enemyId: addEnemy(), status: 'vibing' }).error).toBe(
      'invalid_payload',
    )
  })
})

describe('enemy.remove and reorder', () => {
  it('keeps enough on removal to put it back', () => {
    const id = addEnemy('Duplicate')
    run('enemy.damage', { enemyId: id, amount: 4 })

    const removed = run('enemy.remove', { enemyId: id }).logged
    expect(removed).toMatchObject({ label: 'Duplicate', damageTotal: 4 })
    expect(enemies()).toHaveLength(0)
  })

  it('reorders the whole list at once, or not at all', () => {
    const a = addEnemy('A')
    const b = addEnemy('B')
    const c = addEnemy('C')

    run('enemy.reorder', { orderedIds: [c, a, b] })
    expect(enemies().map((e) => e.label)).toEqual(['C', 'A', 'B'])

    expect(run('enemy.reorder', { orderedIds: [a, a] }).error).toBe('invalid_payload')
    expect(run('enemy.reorder', { orderedIds: ['nope'] }).error).toBe('no_such_enemy')
  })
})

describe('encounter.new', () => {
  it('clears the board without losing the history', () => {
    const ogre = addEnemy('Ogre')
    run('enemy.damage', { enemyId: ogre, amount: 11 }, sam)
    run('enemy.damage', { enemyId: ogre, amount: 6 }, robin)

    const { logged } = run('encounter.new')
    expect(logged.count).toBe(1)
    expect(enemies()).toHaveLength(0)

    // Archived, not deleted, and every hit is still on the record.
    const row = db.prepare('SELECT * FROM enemies WHERE id = ?').get(ogre)
    expect(row.archived_at).toBe(logged.archivedAt)
    expect(row.damage_total).toBe(17)

    const hits = db.prepare("SELECT COUNT(*) FROM events WHERE type = 'enemy.damage'").pluck().get()
    expect(hits).toBe(2)
  })

  it('stamps one encounter with one timestamp', () => {
    addEnemy('Ogre')
    addEnemy('Wolf')
    run('encounter.new')

    const stamps = db.prepare('SELECT DISTINCT archived_at FROM enemies').pluck().all()
    expect(stamps).toHaveLength(1)
  })

  it('will not touch an archived enemy afterwards', () => {
    const id = addEnemy()
    run('encounter.new')
    expect(run('enemy.damage', { enemyId: id, amount: 5 }).error).toBe('no_such_enemy')
  })

  it('refuses when the board is already clear', () => {
    expect(run('encounter.new').error).toBe('nothing_to_archive')
  })

  it('leaves the next encounter its own numbering', () => {
    const old = addEnemy('Ogre')
    run('enemy.damage', { enemyId: old, amount: 30 })
    run('encounter.new')

    const fresh = addEnemy('Wolf')
    expect(first()).toMatchObject({ label: 'Wolf', damageTotal: 0 })
    expect(first().hits).toEqual([])

    run('enemy.damage', { enemyId: fresh, amount: 4 })
    expect(first().damageTotal).toBe(4)
  })
})
