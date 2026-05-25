-- Store submitted proposal file references on the source opportunity so
-- Contract Admin can display them after the award becomes an active contract.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS proposals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS assigned_opportunities TEXT[] DEFAULT '{}';
