-- 024: notification scheduling watermarks
-- Idempotent ALTERs so the migration can re-run safely.

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS notified_due_24h BOOLEAN,
  ADD COLUMN IF NOT EXISTS notified_due_4h BOOLEAN;

ALTER TABLE public.non_submission_reports
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
