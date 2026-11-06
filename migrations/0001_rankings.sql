CREATE TABLE rounds (
 id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL,
 issued_at INTEGER NOT NULL,
 rules_version INTEGER NOT NULL DEFAULT 1,
 nickname TEXT,
 score INTEGER CHECK(score IS NULL OR score >= 0),
 max_combo INTEGER,
 submitted_at INTEGER,
 payload_hash TEXT
);
CREATE INDEX ranking_order ON rounds(score DESC, submitted_at ASC, id ASC) WHERE score IS NOT NULL;
CREATE INDEX pending_rounds ON rounds(issued_at) WHERE score IS NULL;
