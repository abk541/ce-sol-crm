-- Align the live database with the simplified CRM hierarchy. The app seeds
-- baseline employees at startup so assignment foreign keys can save correctly.

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_role_check CHECK (role IN ('BD_MANAGER','TEAM_LEAD','ASSOCIATE'));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('BD_MANAGER','TEAM_LEAD','ASSOCIATE'));

ALTER TABLE public.opportunities DROP COLUMN IF EXISTS prime;
ALTER TABLE public.contracts DROP COLUMN IF EXISTS prime;
ALTER TABLE public.fresh_awards DROP COLUMN IF EXISTS prime;
ALTER TABLE public.past_performances DROP COLUMN IF EXISTS prime;
ALTER TABLE public.bd_submissions DROP COLUMN IF EXISTS prime;
