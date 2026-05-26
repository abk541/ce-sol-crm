-- Store the manually-entered government contract number separately from the
-- internal/system contract id.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_number TEXT;
