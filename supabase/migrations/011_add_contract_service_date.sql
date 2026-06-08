-- Manual "service date" entered in the Billing Period tab of contract admin.
-- Printed on every generated invoice for the contract.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS service_date DATE;
