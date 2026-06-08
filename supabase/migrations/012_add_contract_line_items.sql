-- Contract line items (CLINs) entered in the "Line Items" tab of contract admin.
-- CLIN format is generated client-side per contract:
--   base year       -> 0001, 0002, 0003 ...
--   option year 1   -> 1001, 1002, 1003 ...
--   option year 2   -> 2001, 2002, 2003 ...
--   option year 3   -> 3001, 3002, 3003 ...
--   option year 4   -> 4001, 4002, 4003 ...
-- Max 5 years total (1 base + 4 option), enforced in the UI.

CREATE TABLE IF NOT EXISTS public.contract_line_items (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES public.contracts (id) ON DELETE CASCADE,
  clin         TEXT NOT NULL,
  year         TEXT NOT NULL CHECK (year IN ('base','option1','option2','option3','option4')),
  description  TEXT NOT NULL DEFAULT '',
  quantity     NUMERIC NOT NULL DEFAULT 0,
  unit         TEXT NOT NULL DEFAULT '',
  rate         NUMERIC NOT NULL DEFAULT 0,
  amount       NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_line_items_clin_unique UNIQUE (contract_id, clin)
);

CREATE INDEX IF NOT EXISTS contract_line_items_contract_id_idx
  ON public.contract_line_items (contract_id);
