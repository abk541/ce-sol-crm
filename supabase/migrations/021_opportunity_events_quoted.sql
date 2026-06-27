-- 021_opportunity_events_quoted.sql
-- Adds a structured mandatory-events list (JSONB array of {id,label,date,time})
-- and a QUOTED boolean flag to opportunities. Idempotent.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS mandatory_events_list JSONB,
  ADD COLUMN IF NOT EXISTS quoted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_opportunities_quoted
  ON opportunities (quoted)
  WHERE quoted = TRUE;

NOTIFY pgrst, 'reload schema';
