-- 018_user_persistence.sql
-- Make CRM users a real persisted entity so user create/update/delete and the
-- first-login + MFA-setup completion flows survive across browsers/sessions.
-- Before this migration the app only wrote users to the Zustand persist
-- (localStorage), which meant other admins on other browsers never saw the
-- changes — a critical multi-user data-loss bug.

-- 1) Expand the role check to the real set of app roles. The original schema
--    only allowed BD_MANAGER / TEAM_LEAD / ASSOCIATE, but the app also uses
--    CAPTURE_MANAGER and OPS_MANAGER (see src/types/index.ts → Role).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('CAPTURE_MANAGER','BD_MANAGER','OPS_MANAGER','TEAM_LEAD','ASSOCIATE'));

-- 2) Mirror the BD/OPS team marker that already exists on employees so the
--    org-chart placement is consistent for users too.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS team TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_team_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_team_check
    CHECK (team IS NULL OR team IN ('BD','OPS'));

-- 3) Manager pointer (self-FK) so the admin hierarchy is preserved on reload.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS manager_id TEXT REFERENCES public.users(id) ON DELETE SET NULL;
