-- 20260709000000_add_non_sub_report_comments.sql
--
-- Adds report-scoped discussion + reason-edit tracking to non_submission_reports.
--
-- Background: non-submission reports now carry their own comment thread, kept
-- separate from the opportunity's comments, and the assigned associate can edit
-- the auto-generated reason. The app upserts these two new fields, so the
-- columns must exist for the sync to persist them.
--
--   * comments          jsonb  — array of { id, text, author, authorId?, createdAt, editedAt? }
--   * reason_edited_at   timestamptz — set when the associate rewrites the reason
--
-- Safe to re-run: both columns use ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.non_submission_reports
  ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.non_submission_reports
  ADD COLUMN IF NOT EXISTS reason_edited_at timestamptz;

NOTIFY pgrst, 'reload schema';
