-- Store imported SAM.gov contact snapshots and multiple sourcing POCs.

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS sam_gov_contacts jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS contacts jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
