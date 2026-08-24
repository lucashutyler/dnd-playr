import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { createMember, createSession } from '../rooms/store.js'
import { findHandler } from './index.js'
import { tracksFor } from '../characters/presets.js'

let db
let session
let member

beforeEach(() => {
  db = openDatabase(':memory:')
  session = createSession(db, { name: 'Tuesday Night' })
  member = createMember(db, { sessionId: session.id, tokenHash: 'hash', displayName: 'Sam' })
})

/** Runs an intent the way the hub does: validate, then apply. */
function run(type, payload = {}) {
  const handler = findHandler(type)
  if (!handler) throw new Error('no handler for ' + type)

  const invalid = handler.validate(payload)
  if (invalid) return { error: invalid }

  // The hub re-reads the member every intent; claiming changes it.
  member = db.prepare('SELECT * FROM members WHERE id = ?').get(member.id)
  try {
    return { logged: handler.apply({ db, session, member, payload }) }
  } catch (err) {
    return { error: err.code ?? 'threw', thrown: err }
  }
}

const character = () => db.prepare('SELECT * FROM characters LIMIT 1').get()
const resources = () => db.prepare('SELECT * FROM resources ORDER BY sort, rowid').all()
const trackNamed = (name) => resources().find((r) => r.name === name)

function makeCharacter(payload = { name: 'Vex', class: 'Wizard', level: 5 }) {
  return run('character.create', payload)
}

describe('character.create', () => {
  it('creates, claims, and seeds the class tracks', () => {
    const { logged } = makeCharacter()

    expect(character().name).toBe('Vex')
    expect(character().level).toBe(5)

    const seated = db.prepare('SELECT character_id FROM members WHERE id = ?').get(member.id)
    expect(seated.character_id).toBe(logged.characterId)

    const names = resources().map((r) => r.name)
    expect(names).toContain('Hit Dice')
    expect(names).toContain('Arcane Recovery')
    // A level 5 full caster gets three slot levels offered.
    expect(names).toContain('Level 3 Slots')
    expect(names).not.toContain('Level 4 Slots')
  })

  it('fills in hit dice but leaves the numbers you know to you', () => {
    makeCharacter()
    expect(trackNamed('Hit Dice')).toMatchObject({ current: 5, max: 5 })
    // No slot progression table lives in this codebase, on purpose.
    expect(trackNamed('Level 1 Slots')).toMatchObject({ current: 0, max: 0 })
  })

  it('refuses a blank name or an invented class', () => {
    expect(run('character.create', { name: '   ' }).error).toBe('invalid_payload')
    expect(run('character.create', { name: 'Vex', class: 'Bard-ish' }).error).toBe('unknown_class')
    expect(run('character.create', { name: 'Vex', level: 21 }).error).toBe('invalid_payload')
  })
})

describe('claiming', () => {
  it('lets a second member pick up an existing character', () => {
    const { logged } = makeCharacter()

    const other = createMember(db, { sessionId: session.id, tokenHash: 'other' })
    const handler = findHandler('character.claim')
    handler.apply({ db, session, member: other, payload: { characterId: logged.characterId } })

    const claims = db.prepare('SELECT character_id FROM members').pluck().all()
    // Two members, one character. That is the design, not a clash.
    expect(claims).toEqual([logged.characterId, logged.characterId])
  })

  it('will not claim a character from another room', () => {
    const elsewhere = createSession(db, {})
    const handler = findHandler('character.create')
    const strangerMember = createMember(db, { sessionId: elsewhere.id, tokenHash: 'x' })
    const made = handler.apply({
      db,
      session: elsewhere,
      member: strangerMember,
      payload: { name: 'Not Yours' },
    })

    expect(run('character.claim', { characterId: made.characterId }).error).toBe('threw')
  })

  it('releases without deleting the sheet', () => {
    makeCharacter()
    run('character.release')

    const seated = db.prepare('SELECT character_id FROM members WHERE id = ?').get(member.id)
    expect(seated.character_id).toBeNull()
    expect(character()).toBeTruthy()
  })
})

describe('hp.damage', () => {
  beforeEach(() => {
    makeCharacter({ name: 'Vex', class: 'Wizard', level: 5 })
    run('character.update', { hpMax: 30 }) // first max starts you full
  })

  it('eats temporary hit points before real ones', () => {
    run('character.update', { hpTemp: 5 })
    const { logged } = run('hp.damage', { amount: 3 })

    expect(logged).toMatchObject({ absorbedByTemp: 3, hpTemp: 2, hpCurrent: 30 })
  })

  it('spills past temp into real hit points', () => {
    run('character.update', { hpTemp: 5 })
    const { logged } = run('hp.damage', { amount: 8 })

    expect(logged).toMatchObject({ absorbedByTemp: 5, hpTemp: 0, hpCurrent: 27 })
  })

  it('stops at zero rather than going negative', () => {
    const { logged } = run('hp.damage', { amount: 999 })
    expect(logged.hpCurrent).toBe(0)
  })

  it('refuses zero and negative amounts', () => {
    expect(run('hp.damage', { amount: 0 }).error).toBe('invalid_payload')
    expect(run('hp.damage', { amount: -5 }).error).toBe('invalid_payload')
  })
})

describe('hp.heal', () => {
  beforeEach(() => {
    makeCharacter()
    run('character.update', { hpMax: 30 })
  })

  it('tops out at max', () => {
    run('hp.heal', { amount: 999 })
    expect(character().hp_current).toBe(30)
  })

  it('clears death saves once above zero', () => {
    run('hp.damage', { amount: 30 }) // down
    run('death.set', { successes: 2, failures: 2 })
    run('hp.heal', { amount: 1 })

    expect(character()).toMatchObject({ death_success: 0, death_failure: 0, hp_current: 1 })
  })

  it('leaves temporary hit points alone', () => {
    run('character.update', { hpTemp: 4 })
    run('hp.heal', { amount: 5 })
    expect(character().hp_temp).toBe(4)
  })

  it('is not capped at zero when no max has been set yet', () => {
    run('character.update', { hpMax: 0 })
    run('hp.heal', { amount: 7 })
    expect(character().hp_current).toBe(7)
  })
})

describe('character.update', () => {
  beforeEach(() => makeCharacter())

  it('starts you at full the first time a max is set', () => {
    expect(character()).toMatchObject({ hp_max: 0, hp_current: 0 })
    run('character.update', { hpMax: 30 })
    expect(character()).toMatchObject({ hp_max: 30, hp_current: 30 })
  })

  it('pulls current hp down when the max drops below it', () => {
    run('character.update', { hpMax: 30 })
    run('hp.heal', { amount: 30 })
    run('character.update', { hpMax: 12 })

    expect(character().hp_current).toBe(12)
  })

  it('stores conditions as a trimmed json array', () => {
    run('character.update', { conditions: [' poisoned ', 'prone'] })
    expect(JSON.parse(character().conditions)).toEqual(['poisoned', 'prone'])
  })

  it('rejects unknown fields and empty updates', () => {
    expect(run('character.update', {}).error).toBe('invalid_payload')
    expect(run('character.update', { hpCurrent: 5 }).error).toBe('invalid_payload')
    expect(run('character.update', { conditions: 'poisoned' }).error).toBe('invalid_payload')
  })
})

describe('resources', () => {
  beforeEach(() => makeCharacter())

  it('adds a track already full, because you added it for a reason', () => {
    const { logged } = run('resource.add', { name: 'Rage', max: 3, resetsOn: 'long' })
    const added = resources().find((r) => r.id === logged.resourceId)
    expect(added).toMatchObject({ current: 3, max: 3, resets_on: 'long' })
  })

  it('spends and restores by delta, clamped at both ends', () => {
    const { logged } = run('resource.add', { name: 'Ki', max: 5 })
    const id = logged.resourceId

    expect(run('resource.adjust', { resourceId: id, delta: -2 }).logged.current).toBe(3)
    expect(run('resource.adjust', { resourceId: id, delta: -99 }).logged.current).toBe(0)
    expect(run('resource.adjust', { resourceId: id, delta: 99 }).logged.current).toBe(5)
  })

  it('treats a track with no max as untracked rather than empty', () => {
    const { logged } = run('resource.add', { name: 'Inspiration', max: 0 })
    expect(run('resource.adjust', { resourceId: logged.resourceId, delta: 4 }).logged.current).toBe(
      4,
    )
  })

  it('fills an untracked row the first time it is given a max', () => {
    const slots = trackNamed('Level 1 Slots')
    expect(slots).toMatchObject({ current: 0, max: 0 })

    run('resource.update', { resourceId: slots.id, max: 4 })
    expect(trackNamed('Level 1 Slots')).toMatchObject({ current: 4, max: 4 })
  })

  it('clamps current down when the max is lowered', () => {
    const { logged } = run('resource.add', { name: 'Ki', max: 5 })
    run('resource.update', { resourceId: logged.resourceId, max: 2 })

    expect(resources().find((r) => r.id === logged.resourceId).current).toBe(2)
  })

  it('keeps enough on removal to put the track back', () => {
    const { logged } = run('resource.add', { name: 'Ki', max: 5 })
    const removed = run('resource.remove', { resourceId: logged.resourceId }).logged

    expect(removed).toMatchObject({ name: 'Ki', current: 5, max: 5, resetsOn: 'long' })
    expect(resources().find((r) => r.id === logged.resourceId)).toBeUndefined()
  })

  it('will not touch a track belonging to someone else', () => {
    const other = createMember(db, { sessionId: session.id, tokenHash: 'other' })
    const theirs = findHandler('character.create').apply({
      db,
      session,
      member: other,
      payload: { name: 'Grog', class: 'Barbarian' },
    })
    const theirTrack = db
      .prepare('SELECT id FROM resources WHERE character_id = ?')
      .pluck()
      .get(theirs.characterId)

    expect(run('resource.adjust', { resourceId: theirTrack, delta: -1 }).error).toBe(
      'no_such_resource',
    )
  })

  it('reorders the whole list at once, or not at all', () => {
    const ids = resources().map((r) => r.id)
    const reversed = [...ids].reverse()

    run('resource.reorder', { orderedIds: reversed })
    expect(resources().map((r) => r.id)).toEqual(reversed)

    expect(run('resource.reorder', { orderedIds: [ids[0], ids[0]] }).error).toBe('invalid_payload')
    expect(run('resource.reorder', { orderedIds: ['nope'] }).error).toBe('no_such_resource')
  })
})

describe('rest.take', () => {
  beforeEach(() => {
    makeCharacter({ name: 'Vex', class: 'Monk', level: 5 })
    run('character.update', { hpMax: 30 })
  })

  it('short rest gives back only what returns on a short rest', () => {
    run('resource.update', { resourceId: trackNamed('Ki').id, max: 5 })
    run('resource.adjust', { resourceId: trackNamed('Ki').id, delta: -5 })
    run('resource.adjust', { resourceId: trackNamed('Hit Dice').id, delta: -3 })

    run('rest.take', { kind: 'short' })

    expect(trackNamed('Ki').current).toBe(5) // short
    expect(trackNamed('Hit Dice').current).toBe(2) // long, untouched
  })

  it('long rest gives back both kinds and puts you back on your feet', () => {
    run('resource.adjust', { resourceId: trackNamed('Hit Dice').id, delta: -4 })
    run('character.update', { hpTemp: 6 })
    run('hp.damage', { amount: 40 })
    run('death.set', { successes: 1, failures: 2 })

    run('rest.take', { kind: 'long' })

    expect(character()).toMatchObject({
      hp_current: 30,
      hp_temp: 0, // temporary hit points do not survive the night
      death_success: 0,
      death_failure: 0,
    })
    expect(trackNamed('Hit Dice').current).toBe(5)
  })

  it('leaves a max-less track alone rather than pretending it is full', () => {
    run('rest.take', { kind: 'long' })
    expect(trackNamed('Level 1 Slots')).toBeUndefined() // monks have none
    expect(trackNamed('Ki').current).toBe(0) // still 0/0, not invented
  })
})

describe('acting without a character', () => {
  it('is refused cleanly rather than crashing', () => {
    for (const type of ['hp.damage', 'hp.heal']) {
      expect(run(type, { amount: 1 }).error).toBe('no_character')
    }
    expect(run('death.set', { successes: 1, failures: 0 }).error).toBe('no_character')
    expect(run('resource.add', { name: 'Rage' }).error).toBe('no_character')
    expect(run('rest.take', { kind: 'long' }).error).toBe('no_character')
  })
})

describe('class presets', () => {
  it('offers slot levels that track the class and the level', () => {
    const names = (cls, lvl) => tracksFor(cls, lvl).map((t) => t.name)

    expect(names('Wizard', 1).filter((n) => n.includes('Slots'))).toHaveLength(1)
    expect(names('Wizard', 9).filter((n) => n.includes('Slots'))).toHaveLength(5)
    expect(names('Wizard', 20).filter((n) => n.includes('Slots'))).toHaveLength(9)
    // Half casters climb slower and stop at 5th.
    expect(names('Paladin', 5).filter((n) => n.includes('Slots'))).toHaveLength(2)
    expect(names('Paladin', 20).filter((n) => n.includes('Slots'))).toHaveLength(5)
    // Warlocks get one pact track instead of a ladder.
    expect(names('Warlock', 10).filter((n) => n.includes('Slots'))).toEqual(['Pact Slots'])
    expect(names('Fighter', 10).filter((n) => n.includes('Slots'))).toEqual([])
  })

  it('gives everyone hit dice equal to their level', () => {
    for (const cls of ['Rogue', 'Wizard', 'Other']) {
      expect(tracksFor(cls, 7)[0]).toMatchObject({ name: 'Hit Dice', current: 7, max: 7 })
    }
  })
})
