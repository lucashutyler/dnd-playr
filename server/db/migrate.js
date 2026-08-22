import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

/**
 * Applies every .sql file in migrations/ that has not run yet, in filename
 * order. Numbered files in a folder — no migration library, on purpose.
 */
export function migrate(db, { log } = {}) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all())
  const pending = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !applied.has(f))

  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name), 'utf8')
    // Each migration is one transaction: it lands whole or not at all.
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
        name,
        new Date().toISOString(),
      )
    })()
    log?.info?.({ migration: name }, 'migration applied')
  }

  return pending
}
