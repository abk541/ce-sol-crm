-- 20260715120000_add_activity_logs.sql
--
-- The activity log (audit trail) previously lived only in each browser's
-- localStorage, so the Capture Manager / admin only ever saw their OWN actions.
-- Other users' actions (managers, team leads, associates) never reached them.
-- This table promotes the activity log to Supabase so it is workspace-wide and
-- every user's actions appear in real time.
--
-- The user's name is stored in a non-reserved column (`actor`) to avoid the
-- reserved-word `user` column. `actor_role` maps to ActivityLog.userRole.
-- Idempotent. Apply in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id           TEXT PRIMARY KEY,
  action       TEXT NOT NULL,
  actor        TEXT NOT NULL DEFAULT '',
  actor_role   TEXT NOT NULL DEFAULT '',
  entity_type  TEXT NOT NULL DEFAULT '',
  entity_id    TEXT,
  entity_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'activity_logs'
      AND policyname = 'allow_all_activity_logs'
  ) THEN
    CREATE POLICY "allow_all_activity_logs"
      ON public.activity_logs
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs (created_at DESC);

-- Add to the Realtime publication so other sessions refresh the moment a new
-- action is logged. Guarded so re-running is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'activity_logs'
     )
  THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
