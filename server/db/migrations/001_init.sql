-- Phase 1 schema. See the data model section of CLAUDE.md for the reasoning
-- behind the two shapes that look unusual here:
--   * characters carry no owner column; the claim lives on members.character_id
--   * enemies carry damage_total only, never hp_max or hp_current

CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL DEFAULT '',
  passphrase_hash TEXT,
  locked          INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE characters (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  class          TEXT NOT NULL DEFAULT '',
  level          INTEGER NOT NULL DEFAULT 1,
  hp_current     INTEGER NOT NULL DEFAULT 0,
  hp_max         INTEGER NOT NULL DEFAULT 0,
  hp_temp        INTEGER NOT NULL DEFAULT 0,
  ac             INTEGER NOT NULL DEFAULT 10,
  death_success  INTEGER NOT NULL DEFAULT 0,
  death_failure  INTEGER NOT NULL DEFAULT 0,
  conditions     TEXT NOT NULL DEFAULT '[]',
  notes          TEXT NOT NULL DEFAULT '',
  sort           INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- Every spendable thing is a row here: spell slots, hit dice, rage, ki, bardic
-- inspiration, homebrew. There is deliberately no spell_slots table.
CREATE TABLE resources (
  id           TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  current      INTEGER NOT NULL DEFAULT 0,
  max          INTEGER NOT NULL DEFAULT 0,
  resets_on    TEXT NOT NULL DEFAULT 'long' CHECK (resets_on IN ('short', 'long', 'never')),
  sort         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE enemies (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  damage_total INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'defeated', 'fled')),
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);

-- character_id is the claim. Several members may point at one character: phone
-- plus tablet, or this week's token alongside last week's.
CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  session_id   TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  character_id TEXT REFERENCES characters (id) ON DELETE SET NULL,
  display_name TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

-- Append-only. Powers undo and damage attribution. Never rewrite a row.
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
  member_id  TEXT REFERENCES members (id) ON DELETE SET NULL,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_characters_session ON characters (session_id);
CREATE INDEX idx_resources_character ON resources (character_id, sort);
CREATE INDEX idx_enemies_session ON enemies (session_id, sort);
CREATE INDEX idx_members_session ON members (session_id);
CREATE INDEX idx_events_session ON events (session_id, id);
