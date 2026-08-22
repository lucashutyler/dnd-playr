-- Closing a room takes it out of use without destroying a campaign's history.
-- Same shape as enemies.archived_at: a timestamp, never a delete.
ALTER TABLE sessions ADD COLUMN archived_at TEXT;
