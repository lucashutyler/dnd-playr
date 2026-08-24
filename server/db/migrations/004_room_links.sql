-- One identifier for a room, not two.
--
-- The four-letter code is gone. A room is now its link: url_id is generated,
-- longer than a code on purpose, and is what you share, scan, or type. slug is
-- an optional alias somebody chose, and because a chosen name is guessable it
-- is only allowed on a room that has a passphrase.
--
-- SQLite will not drop a UNIQUE column, so the table is rebuilt. Foreign keys
-- are off while migrations run, which is what stops the drop cascading into
-- every child row.

CREATE TABLE sessions_new (
  id              TEXT PRIMARY KEY,
  url_id          TEXT NOT NULL UNIQUE,
  slug            TEXT UNIQUE,
  name            TEXT NOT NULL DEFAULT '',
  passphrase_hash TEXT,
  locked          INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  archived_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Rooms that predate links get a generated one. Hex is weaker than what the
-- generator uses; that is fine for the handful of rooms that already exist.
INSERT INTO sessions_new (
  id, url_id, slug, name, passphrase_hash, locked, archived_at, created_at, updated_at
)
SELECT id, lower(hex(randomblob(5))), NULL, name, passphrase_hash, locked,
       archived_at, created_at, updated_at
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;
