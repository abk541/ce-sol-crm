-- 019_permission_overrides.sql
-- Persist runtime permission overrides edited from Admin → Permissions matrix.
--
-- Until this migration is applied the app still works: every override write
-- in src/lib/db.ts (savePermissionOverrides) catches "relation does not
-- exist" and the store falls back to Zustand+localStorage. The Admin page
-- shows a "Local-only" pill in that case so the user knows changes won't
-- propagate to other browsers.
--
-- After applying this migration the same edits are mirrored to Supabase and
-- shared across every browser that connects to this project.

-- Role-level overrides. One row per Role; permissions is the FULL replacement
-- list for that role (we deliberately store the full set rather than diffs so
-- the schema stays trivial and conflict-free).
CREATE TABLE IF NOT EXISTS public.role_permission_overrides (
  role        TEXT PRIMARY KEY,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT role_permission_overrides_role_check
    CHECK (role IN ('CAPTURE_MANAGER','BD_MANAGER','OPS_MANAGER','TEAM_LEAD','ASSOCIATE'))
);

-- Per-user diff applied on top of their role permissions. grants are added,
-- revokes are removed. Either array can be empty; rows with both empty arrays
-- are treated as "no override" and may be removed by the app to keep the
-- table tidy.
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  user_id    TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  grants     JSONB NOT NULL DEFAULT '[]'::jsonb,
  revokes    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same permissive RLS pattern the rest of the schema uses.
ALTER TABLE public.role_permission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'role_permission_overrides',
    'user_permission_overrides'
  ] LOOP
    EXECUTE format('
      CREATE POLICY IF NOT EXISTS "allow_all_%s" ON public.%I
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
    ', tbl, tbl);
  END LOOP;
END $$;
