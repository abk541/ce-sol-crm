-- 20260707000000_add_notifications_and_employee_requests.sql
--
-- Two collaboration tables that were previously kept only in each browser's
-- localStorage, which meant they never reached other users:
--
--   * notifications      — in-app alerts. Because they lived only in the
--                          author's browser, "person X" never received the
--                          notification/toast for actions that concerned them.
--   * employee_requests  — HR requests. An associate's request never reached
--                          the Capture Manager (they run in different browsers),
--                          so it could not be reviewed and the reply was never
--                          seen by the associate.
--
-- Promoting both to Supabase makes them workspace-wide. A new `target_user_id`
-- column lets a notification be directed at one specific user (in addition to
-- the existing role-based `target_role`). Both tables use the same permissive
-- RLS the rest of the schema uses; access is gated client-side.
--
-- Both tables are also added to the `supabase_realtime` publication so other
-- sessions are refreshed the moment a row changes (with client-side polling as
-- the fallback when Realtime is unavailable).
--
-- Until this migration is applied the app silently falls back to per-browser
-- localStorage for these two entities and the cross-user behaviour above will
-- not work. Apply this file in the Supabase SQL editor to activate it.

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,
  title          TEXT NOT NULL,
  message        TEXT NOT NULL DEFAULT '',
  read           BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  related_id     TEXT,
  target_role    TEXT,
  target_user_id TEXT
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'allow_all_notifications'
  ) THEN
    CREATE POLICY "allow_all_notifications"
      ON public.notifications
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── employee_requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employee_requests (
  id              TEXT PRIMARY KEY,
  requester_id    TEXT NOT NULL,
  requester_name  TEXT NOT NULL DEFAULT '',
  requester_email TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'OTHER',
  title           TEXT NOT NULL DEFAULT '',
  details         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'PENDING',
  priority        TEXT NOT NULL DEFAULT 'MEDIUM',
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     TEXT,
  review_note     TEXT,
  attachments     JSONB NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'employee_requests'
      AND policyname = 'allow_all_employee_requests'
  ) THEN
    CREATE POLICY "allow_all_employee_requests"
      ON public.employee_requests
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────
-- Add the collaboration tables (and the core business tables) to the
-- supabase_realtime publication so every connected session is nudged to
-- refresh the instant a row changes. Each ADD is guarded so re-running the
-- migration is a no-op and it never fails on an already-published table or a
-- missing publication.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'notifications',
    'employee_requests',
    'opportunities',
    'contracts',
    'fresh_awards',
    'past_performances',
    'non_submission_reports',
    'deletion_requests',
    'bd_submissions',
    'comments',
    'subcontractors',
    'activity_logs'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY tables LOOP
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t)
         AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
         )
      THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
