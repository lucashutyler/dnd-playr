import { mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { config } from '../config.js'

/**
 * A consistent copy of a live database.
 *
 * Plain `cp` is not enough once WAL is on: recent writes live in the -wal file
 * and a copy taken mid-write can miss them. SQLite's own backup API takes a
 * coherent snapshot while the server keeps running.
 *
 *   npm run backup                 -> data/backups/dnd-playr-<timestamp>.db
 *   npm run backup -- /path/to.db  -> wherever you say
 */
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const destination = process.argv[2] ?? join('data', 'backups', 'dnd-playr-' + stamp + '.db')

mkdirSync(dirname(destination), { recursive: true })

const db = new Database(config.dbPath, { readonly: true })

try {
  await db.backup(destination)
  const { size } = statSync(destination)
  console.log('backed up ' + config.dbPath + ' -> ' + destination)
  console.log(Math.round(size / 1024) + ' KB')
} catch (err) {
  console.error('backup failed:', err.message)
  process.exitCode = 1
} finally {
  db.close()
}
