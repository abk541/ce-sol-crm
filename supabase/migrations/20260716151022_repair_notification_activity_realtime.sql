-- Repair collaboration tables that may still have the legacy schema.
--
-- Some environments created notifications before direct user targeting was
-- introduced and created activity_logs with user_name/user_role columns. The
-- current application writes target_user_id and actor/actor_role, so those
-- older tables reject every insert unless they are upgraded in place.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_target_user_id
  ON public.notifications (target_user_id)
  WHERE target_user_id IS NOT NULL;

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS actor TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_logs'
      AND column_name = 'user_name'
  ) THEN
    UPDATE public.activity_logs
    SET actor = COALESCE(actor, user_name, '')
    WHERE actor IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_logs'
      AND column_name = 'user_role'
  ) THEN
    UPDATE public.activity_logs
    SET actor_role = COALESCE(actor_role, user_role, '')
    WHERE actor_role IS NULL;
  END IF;
END $$;

UPDATE public.activity_logs SET actor = '' WHERE actor IS NULL;
UPDATE public.activity_logs SET actor_role = '' WHERE actor_role IS NULL;

ALTER TABLE public.activity_logs
  ALTER COLUMN actor SET DEFAULT '',
  ALTER COLUMN actor SET NOT NULL,
  ALTER COLUMN actor_role SET DEFAULT '',
  ALTER COLUMN actor_role SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
  ON public.activity_logs (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'allow_all_notifications'
  ) THEN
    CREATE POLICY "allow_all_notifications"
      ON public.notifications
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_logs'
      AND policyname = 'allow_all_activity_logs'
  ) THEN
    CREATE POLICY "allow_all_activity_logs"
      ON public.activity_logs
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO anon, authenticated;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH table_name IN ARRAY ARRAY['notifications', 'activity_logs'] LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = table_name
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
          table_name
        );
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
