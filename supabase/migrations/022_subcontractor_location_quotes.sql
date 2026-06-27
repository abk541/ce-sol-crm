-- 022: add location + multi-quote attachments to subcontractors
-- Idempotent ALTERs so the migration can re-run safely on dev/staging/prod.

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.subcontractors
  ADD COLUMN IF NOT EXISTS quote_files JSONB;

-- Backfill quote_files from legacy quote_file column for any rows where
-- the new column is null but a single legacy filename exists.
UPDATE public.subcontractors
SET quote_files = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', quote_file,
    'attachedAt', COALESCE(created_at, NOW())::text,
    'uploadedBy', COALESCE(created_by, '')
  )
)
WHERE quote_files IS NULL
  AND quote_file IS NOT NULL
  AND length(trim(quote_file)) > 0;

NOTIFY pgrst, 'reload schema';
