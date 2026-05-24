-- Prevent duplicate active opportunities for the same solicitation.
-- Admin-deleted rows (is_deleted = true) are ignored so a solicitation can be recreated after approval/deletion.

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_active_solicitation_id_unique
ON public.opportunities (LOWER(BTRIM(solicitation_id)))
WHERE solicitation_id IS NOT NULL
  AND BTRIM(solicitation_id) <> ''
  AND COALESCE(is_deleted, false) = false;
