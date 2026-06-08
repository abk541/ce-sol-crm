-- 016_clear_business_data.sql
-- Wipe all business records (contracts, opportunities, finances, awards,
-- past performances, subks and their related rows) while preserving the
-- employees and users tables. Safe to re-run.
--
-- TRUNCATE ... CASCADE is used so child rows referencing parents via FK
-- (with or without ON DELETE CASCADE) are removed in a single statement
-- and identity sequences are reset.

TRUNCATE TABLE
  public.contract_invoices,
  public.contract_line_items,
  public.contract_pocs,
  public.locked_subcontractors,
  public.government_warnings,
  public.contracts,
  public.comments,
  public.opportunities,
  public.fresh_awards,
  public.past_performances,
  public.subcontractors,
  public.subk_database,
  public.bd_submissions,
  public.non_submission_reports,
  public.deletion_requests,
  public.activity_logs,
  public.notifications
RESTART IDENTITY CASCADE;

NOTIFY pgrst, 'reload schema';
