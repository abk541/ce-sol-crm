ALTER TABLE public.government_warnings
  ADD COLUMN IF NOT EXISTS deadline TEXT;
