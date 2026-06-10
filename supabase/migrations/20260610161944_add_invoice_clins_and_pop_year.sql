-- Add invoice-period, selected CLIN, and POP year fields used by Contract Admin
-- and Finance Projections. These are additive so older rows keep working.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS billing_period_start TEXT,
  ADD COLUMN IF NOT EXISTS billing_period_end TEXT,
  ADD COLUMN IF NOT EXISTS current_pop_year TEXT
    CHECK (current_pop_year IN ('base','option1','option2','option3','option4'));

ALTER TABLE public.contract_invoices
  ADD COLUMN IF NOT EXISTS service_from TEXT,
  ADD COLUMN IF NOT EXISTS service_to TEXT,
  ADD COLUMN IF NOT EXISTS pop_year TEXT
    CHECK (pop_year IN ('base','option1','option2','option3','option4')),
  ADD COLUMN IF NOT EXISTS line_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
