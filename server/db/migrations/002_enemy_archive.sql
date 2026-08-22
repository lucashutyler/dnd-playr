-- "New encounter" archives rather than deletes, so the hit history stays
-- readable afterwards. A shared archived_at is what groups one encounter.
ALTER TABLE enemies ADD COLUMN archived_at TEXT;

CREATE INDEX idx_enemies_active ON enemies (session_id, archived_at, sort);

-- The per-hit history is read straight out of the event log rather than a
-- column, so attribution and the tally can never disagree.
CREATE INDEX idx_events_type ON events (session_id, type, id);
