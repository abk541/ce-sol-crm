-- IDIQ Task Orders and BPA Calls attached to a parent contract.
-- These records behave like child contracts while keeping the parent contract
-- as the main Contract Admin record.

CREATE TABLE IF NOT EXISTS public.contract_vehicle_orders (
  id            TEXT PRIMARY KEY,
  contract_id   TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('TASK_ORDER','CALL')),
  order_number  TEXT NOT NULL,
  total_value   NUMERIC(14,2) NOT NULL DEFAULT 0,
  pop_start     TEXT NOT NULL DEFAULT '',
  pop_end       TEXT NOT NULL DEFAULT '',
  document      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT,
  CONSTRAINT contract_vehicle_orders_number_unique UNIQUE (contract_id, type, order_number)
);

CREATE INDEX IF NOT EXISTS contract_vehicle_orders_contract_id_idx
  ON public.contract_vehicle_orders (contract_id);

ALTER TABLE public.contract_vehicle_orders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'contract_vehicle_orders'
      AND policyname = 'allow_all_contract_vehicle_orders'
  ) THEN
    CREATE POLICY "allow_all_contract_vehicle_orders"
      ON public.contract_vehicle_orders
      FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
