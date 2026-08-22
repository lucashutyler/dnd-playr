import { describe, expect, it } from 'vitest'
import {
  bearerFrom,
  createToken,
  hashPassphrase,
  hashToken,
  tokenHashEquals,
  verifyPassphrase,
} from './tokens.js'

describe('tokens', () => {
  it('mints distinct url-safe tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => createToken()))
    expect(tokens.size).toBe(500)
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('hashes deterministically and differs per token', () => {
    const a = createToken()
    expect(hashToken(a)).toBe(hashToken(a))
    expect(hashToken(a)).not.toBe(hashToken(createToken()))
    expect(hashToken(a)).toHaveLength(64)
  })

  it('compares hashes in constant time without throwing on junk', () => {
    const h = hashToken('x')
    expect(tokenHashEquals(h, h)).toBe(true)
    expect(tokenHashEquals(h, hashToken('y'))).toBe(false)
    expect(tokenHashEquals(h, 'short')).toBe(false)
    expect(tokenHashEquals(null, h)).toBe(false)
  })

  it('reads bearer headers, and only bearer headers', () => {
    expect(bearerFrom({ headers: { authorization: 'Bearer abc' } })).toBe('abc')
    expect(bearerFrom({ headers: { authorization: 'bearer abc' } })).toBe('abc')
    expect(bearerFrom({ headers: { authorization: 'Basic abc' } })).toBeNull()
    expect(bearerFrom({ headers: {} })).toBeNull()
    expect(bearerFrom({})).toBeNull()
  })
})

describe('passphrases', () => {
  it('verifies the right one and rejects the wrong one', async () => {
    const hash = await hashPassphrase('dragons')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await verifyPassphrase('dragons', hash)).toBe(true)
    expect(await verifyPassphrase('Dragons', hash)).toBe(false)
  })

  it('salts, so the same passphrase hashes differently', async () => {
    expect(await hashPassphrase('dragons')).not.toBe(await hashPassphrase('dragons'))
  })

  it('returns false rather than throwing on a missing or corrupt hash', async () => {
    expect(await verifyPassphrase('dragons', null)).toBe(false)
    expect(await verifyPassphrase('dragons', 'not-a-hash')).toBe(false)
  })
})
