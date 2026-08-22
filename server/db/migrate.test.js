import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrate } from './migrate.js'

describe('migrations', () => {
  it('applies pending files once and is idempotent', () => {
    const db = new Database(':memory:')

    const first = migrate(db)
    expect(first.length).toBeGreaterThan(0)
    expect(first).toContain('001_init.sql')

    const second = migrate(db)
    expect(second).toEqual([])

    const applied = db.prepare('SELECT name FROM schema_migrations').pluck().all()
    expect(applied).toEqual(first)
    db.close()
  })

  it('creates every table the app expects', () => {
    const db = new Database(':memory:')
    migrate(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all()
    for (const t of ['sessions', 'members', 'characters', 'resources', 'enemies', 'events']) {
      expect(tables).toContain(t)
    }
    db.close()
  })

  it('keeps enemies free of any hp columns', () => {
    const db = new Database(':memory:')
    migrate(db)
    const columns = db
      .prepare('PRAGMA table_info(enemies)')
      .all()
      .map((c) => c.name)
    expect(columns).toContain('damage_total')
    expect(columns.some((c) => c.includes('hp'))).toBe(false)
    db.close()
  })

  it('puts the character claim on members, not an owner column on characters', () => {
    const db = new Database(':memory:')
    migrate(db)
    const memberCols = db
      .prepare('PRAGMA table_info(members)')
      .all()
      .map((c) => c.name)
    const charCols = db
      .prepare('PRAGMA table_info(characters)')
      .all()
      .map((c) => c.name)
    expect(memberCols).toContain('character_id')
    expect(charCols).not.toContain('member_id')
    db.close()
  })
})
