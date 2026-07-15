-- 20260715000000_add_opportunity_non_submission_exempt.sql
-- Adds a flag marking opportunities a capture manager deliberately returned to
-- the pipeline from a non-submission report. These must be exempted from the
-- automatic non-submission sweep, otherwise an already-overdue opportunity is
-- re-reported within seconds and bounces straight back to Non-Submission
-- Reports. Idempotent.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS non_submission_exempt BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
