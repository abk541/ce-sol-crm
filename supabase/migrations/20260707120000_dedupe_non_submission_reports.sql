-- 20260707120000_dedupe_non_submission_reports.sql
--
-- Cleans up duplicate non-submission reports and prevents them recurring.
--
-- Background: the automatic "deadline passed → non-submission" sweep used to mint
-- a time-based row id (nsr<timestamp>-<index>) every time it ran. Because the
-- upsert keys on that id, a race between the sweep and the live cross-user
-- refresh could insert several rows for the *same* opportunity (observed 5-6x).
-- The app now uses a deterministic id (nsr-<opportunityId>) so the upsert is
-- idempotent, but the rows created before that fix are still in the table.
--
-- This migration:
--   1. Deletes the duplicates, keeping the earliest report per opportunity.
--   2. Re-keys the survivors to the deterministic id the app now uses, so any
--      future upsert resolves on the primary key (UPDATE) instead of inserting a
--      second row, and keeps the opportunity's back-reference in sync.
--   3. Adds a UNIQUE index on opportunity_id as a database-level backstop.
--
-- Safe to re-run: the deletes/updates become no-ops once deduplicated and the
-- index uses IF NOT EXISTS.

-- ── 1. Remove duplicates, keeping the earliest submission per opportunity ─────
-- First by submitted_at (older wins)...
DELETE FROM public.non_submission_reports a
USING public.non_submission_reports b
WHERE a.opportunity_id IS NOT NULL
  AND a.opportunity_id = b.opportunity_id
  AND a.submitted_at > b.submitted_at;

-- ...then break any exact-timestamp ties deterministically by id.
DELETE FROM public.non_submission_reports a
USING public.non_submission_reports b
WHERE a.opportunity_id IS NOT NULL
  AND a.opportunity_id = b.opportunity_id
  AND a.submitted_at = b.submitted_at
  AND a.id > b.id;

-- ── 2. Re-key survivors to the deterministic id the app now generates ────────
UPDATE public.non_submission_reports
SET id = 'nsr-' || opportunity_id
WHERE opportunity_id IS NOT NULL
  AND id <> 'nsr-' || opportunity_id;

-- Keep the opportunity's back-reference pointing at the (possibly re-keyed) row.
UPDATE public.opportunities
SET non_submission_report_id = 'nsr-' || id
WHERE non_submission_report_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.non_submission_reports r
    WHERE r.opportunity_id = public.opportunities.id
  );

-- ── 3. Enforce one report per opportunity going forward ──────────────────────
-- Partial index tolerates any legacy rows with a NULL opportunity_id.
CREATE UNIQUE INDEX IF NOT EXISTS non_submission_reports_opportunity_id_key
  ON public.non_submission_reports (opportunity_id)
  WHERE opportunity_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
