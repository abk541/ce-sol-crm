-- Persist private attachment references on opportunity comments.
--
-- The UI has exposed comment attachment controls for a long time, but the
-- restored PostgreSQL schema only stored the comment body. Keeping the files
-- in a JSONB array matches every other attachment-bearing record and lets the
-- native file service remain the single source of bytes.

\set ON_ERROR_STOP on

begin;

alter table public.comments
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.comments
  drop constraint if exists comments_attachments_is_array;

alter table public.comments
  add constraint comments_attachments_is_array
  check (jsonb_typeof(attachments) = 'array')
  not valid;

alter table public.comments
  validate constraint comments_attachments_is_array;

commit;
