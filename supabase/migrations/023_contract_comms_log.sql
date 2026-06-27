-- 023: add comms_log column to contracts (Comm Progress section)
-- Idempotent ALTER so the migration can re-run safely.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS comms_log JSONB;

NOTIFY pgrst, 'reload schema';
