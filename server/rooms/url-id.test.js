import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { ALPHABET, LENGTH, allocateUrlId, isValidUrlId, randomUrlId } from './url-id.js'
import { createSession } from './store.js'

describe('room link ids', () => {
  it('avoids the shapes people mistype off a screen', () => {
    for (const ambiguous of ['i', 'l', 'o', '0', '1']) {
      expect(ALPHABET).not.toContain(ambiguous)
    }
  })

  it('generates ids of the right length from the alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const id = randomUrlId()
      expect(id).toHaveLength(LENGTH)
      expect([...id].every((c) => ALPHABET.includes(c))).toBe(true)
    }
  })

  it('is long enough that a shared link is not guessable', () => {
    // Six characters of a 31 letter alphabet is comfortably past brute force,
    // which a four letter code never was.
    expect(ALPHABET.length ** LENGTH).toBeGreaterThan(500_000_000)
  })

  it('accepts what it generates and rejects what it does not', () => {
    expect(isValidUrlId(randomUrlId())).toBe(true)
    expect(isValidUrlId('ABCDEF')).toBe(true) // case is forgiven
    expect(isValidUrlId('abc')).toBe(false)
    expect(isValidUrlId('has-a-hyphen')).toBe(false)
    expect(isValidUrlId('a'.repeat(17))).toBe(false)
    expect(isValidUrlId(null)).toBe(false)
  })

  it('never hands out one already in use', () => {
    const db = openDatabase(':memory:')
    const seen = new Set()

    for (let i = 0; i < 200; i += 1) {
      const id = allocateUrlId(db)
      expect(seen.has(id)).toBe(false)
      seen.add(id)
      createSession(db, { urlId: id })
    }
    db.close()
  })

  it('creates every room with a link of its own', () => {
    const db = openDatabase(':memory:')
    const ids = new Set()
    for (let i = 0; i < 20; i += 1) ids.add(createSession(db, {}).url_id)

    expect(ids.size).toBe(20)
    expect([...ids].every(isValidUrlId)).toBe(true)
    db.close()
  })
})
