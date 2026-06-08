-- 013_finance_projections_and_sourcing_website.sql
-- Adds:
--   * contracts.gov_billing_status — government invoice status used by Finance Projections.
--   * subcontractors.website — website URL captured during BD sourcing.
-- Locked-subcontractor "paid" flag and locked-subk "website" piggy-back on the
-- existing __lsubmeta__: JSON envelope inside locked_subcontractors.notes, so no
-- new column is needed there.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS gov_billing_status text;

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS website text;

NOTIFY pgrst, 'reload schema';
