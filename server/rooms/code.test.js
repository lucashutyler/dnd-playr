import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db/index.js'
import { ALPHABET, allocateCode, isValidCode, normalizeCode, randomCode } from './code.js'

describe('room codes', () => {
  it('never contains the ambiguous letters', () => {
    expect(ALPHABET).not.toMatch(/[IO]/)
    expect(ALPHABET).toHaveLength(24)
  })

  it('generates codes of the requested length from the alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = randomCode()
      expect(code).toHaveLength(4)
      expect([...code].every((c) => ALPHABET.includes(c))).toBe(true)
    }
  })

  it('accepts valid codes and rejects the rest', () => {
    expect(isValidCode('KTZP')).toBe(true)
    expect(isValidCode('ktzp')).toBe(true)
    expect(isValidCode('KTIP')).toBe(false) // I is not in the alphabet
    expect(isValidCode('KT0P')).toBe(false)
    expect(isValidCode('KTZ')).toBe(false)
    expect(isValidCode(null)).toBe(false)
  })

  it('normalizes to uppercase and trims', () => {
    expect(normalizeCode('  ktzp ')).toBe('KTZP')
    expect(normalizeCode(undefined)).toBe('')
  })

  it('does not hand out a code already in use', () => {
    const db = openDatabase(':memory:')
    const at = new Date().toISOString()
    const insert = db.prepare(
      `INSERT INTO sessions (id, code, name, locked, created_at, updated_at)
       VALUES (?, ?, '', 0, ?, ?)`,
    )
    // Fill the 4-letter space so allocation is forced to widen.
    const seen = new Set()
    for (let i = 0; i < 300; i += 1) {
      const code = randomCode()
      if (seen.has(code)) continue
      seen.add(code)
      insert.run(`id-${i}`, code, at, at)
    }
    for (let i = 0; i < 50; i += 1) {
      expect(seen.has(allocateCode(db))).toBe(false)
    }
    db.close()
  })
})
