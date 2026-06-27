-- 020_comment_ownership.sql
-- Adds the two columns needed to attribute comments to a specific user and to
-- show an "edited" badge when the body has been changed after the fact.
--
-- The app degrades gracefully if this migration has not been applied yet —
-- src/lib/db.ts's commentToDb writes NULLs when authorId / editedAt are
-- missing, and Supabase will simply ignore the extra columns until they
-- exist. (No try/catch needed because PostgREST returns the row back, with
-- or without the new columns, and dbToComment treats them as optional.)
--
-- author_id is stored as TEXT to match the existing users.id schema (TEXT PK).
-- edited_at is a nullable TIMESTAMPTZ.

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_id TEXT,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Helpful index for "show me all comments by X" admin queries. Cheap on the
-- expected size of this table (< 100k rows in the foreseeable future).
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);

NOTIFY pgrst, 'reload schema';
