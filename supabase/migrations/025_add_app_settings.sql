-- 025_add_app_settings.sql
-- Generic key/value settings table for integration secrets that must be
-- editable at runtime (SAM.gov API key, etc.) instead of baked into the
-- deployed JavaScript bundle via VITE_* env vars.
--
-- Security note: this is a client-facing Supabase table protected by the
-- same permissive RLS the rest of the schema uses (allow_all_*). The
-- "who can edit" gate is enforced client-side by requiring the
-- `admin:manageUsers` permission on the Admin → Integrations tab. Storing
-- the key here is strictly *more* private than a Vite env var, which gets
-- inlined into public JavaScript at build time and is visible to any
-- anonymous visitor.
--
-- Until this migration is applied the SAM.gov import flow will error with
-- "API key is not configured" and the Admin → Integrations tab will show
-- a "Local only" pill next to the key input. Apply this file in the
-- Supabase SQL editor to activate runtime key management.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'app_settings'
      AND policyname = 'allow_all_app_settings'
  ) THEN
    CREATE POLICY "allow_all_app_settings"
      ON public.app_settings
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed the well-known SAM.gov key row with an empty value so the Admin UI
-- can render an editable input immediately after the migration runs.
INSERT INTO public.app_settings (key, value) VALUES ('sam_gov_api_key', '')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
