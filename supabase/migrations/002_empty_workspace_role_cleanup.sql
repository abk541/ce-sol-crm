-- Reset workspace data and align roles with the simplified hierarchy.
-- This intentionally clears business/auth rows; the app keeps employee mocks locally.

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

DELETE FROM public.contract_pocs;
DELETE FROM public.locked_subcontractors;
DELETE FROM public.government_warnings;
DELETE FROM public.comments;
DELETE FROM public.subcontractors;
DELETE FROM public.non_submission_reports;
DELETE FROM public.deletion_requests;
DELETE FROM public.notifications;
DELETE FROM public.activity_logs;
DELETE FROM public.bd_submissions;
DELETE FROM public.subk_database;
DELETE FROM public.past_performances;
DELETE FROM public.fresh_awards;
DELETE FROM public.contracts;
DELETE FROM public.opportunities;
DELETE FROM public.users;
DELETE FROM public.employees;
