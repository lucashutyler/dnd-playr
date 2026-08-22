import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'
import { migrate } from './migrate.js'

/**
 * Opens a database and brings it up to schema. Pass ':memory:' in tests.
 */
export function openDatabase(path = config.dbPath, { log } = {}) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true })
  }

  const db = new Database(path)

  // WAL lets readers run while a write is in flight, which is what a room full
  // of phones looks like. Backup is still "copy the file" (plus -wal/-shm).
  if (path !== ':memory:') db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  migrate(db, { log })
  return db
}
