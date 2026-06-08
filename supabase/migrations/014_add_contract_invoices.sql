-- 014_add_contract_invoices.sql
-- Adds the contract_invoices table that backs the Finance Projections grid.
-- Each row represents one government invoice for a contract:
--   * invoice_number / invoice_date / amount / payment_method
--   * status — gov billing status (SUBMITTED / BILLED / SENT_FOR_APPROVAL / REJECTED / PAID)
--   * sub_quote / due_date / sub_status — subk payout context (auto-seeded from
--     locked subcontractors but overridable per invoice)

CREATE TABLE IF NOT EXISTS public.contract_invoices (
  id              TEXT PRIMARY KEY,
  contract_id     TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,
  invoice_date    TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method  TEXT,
  status          TEXT NOT NULL DEFAULT 'SUBMITTED'
    CHECK (status IN ('SUBMITTED','BILLED','SENT_FOR_APPROVAL','REJECTED','PAID')),
  sub_quote       NUMERIC(14,2),
  due_date        TEXT,
  sub_status      TEXT CHECK (sub_status IN ('NOT_PAID','PARTIAL','PAID')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_invoices_contract
  ON public.contract_invoices(contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_invoices_invoice_date
  ON public.contract_invoices(invoice_date);

-- Row Level Security — match the permissive policy convention used by other
-- business tables in 001_initial_schema.sql. Tighten when Supabase Auth is wired.
ALTER TABLE public.contract_invoices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'contract_invoices'
      AND policyname = 'allow_all_contract_invoices'
  ) THEN
    CREATE POLICY "allow_all_contract_invoices"
      ON public.contract_invoices
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
