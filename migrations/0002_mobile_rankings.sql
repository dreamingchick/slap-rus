ALTER TABLE rounds ADD COLUMN season TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE rounds ADD COLUMN input_hits TEXT NOT NULL DEFAULT '[]';
CREATE INDEX mobile_ranking_order ON rounds(season,score DESC,submitted_at ASC,id ASC) WHERE score IS NOT NULL;
