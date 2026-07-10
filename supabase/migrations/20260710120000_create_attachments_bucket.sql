-- 20260710120000_create_attachments_bucket.sql
--
-- Creates the "attachments" Supabase Storage bucket used for uploaded files
-- (proposals, quotes, contract documents, certifications, etc.).
--
-- Why: files were previously embedded as base64 data URLs inside the persisted
-- Zustand store in the browser's localStorage (~5MB per-origin cap). Large
-- proposal PDFs blew past the quota and failed to save silently. Files now go to
-- Storage and the app keeps only a small public URL + path reference.
--
-- The app talks to Supabase with the public "anon" key (it has its own auth
-- layer, not Supabase Auth), so the policies below grant the anon/public role
-- read + write access scoped to this single bucket. The bucket is public-read so
-- getPublicUrl() links resolve in the browser.
--
-- Safe to re-run: bucket upsert is idempotent and policies are dropped first.

-- ── 1. Create the bucket (public read) ───────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update set public = true;

-- ── 2. Access policies on storage.objects, scoped to this bucket ─────────────
drop policy if exists "attachments_read" on storage.objects;
create policy "attachments_read"
  on storage.objects for select
  to public
  using (bucket_id = 'attachments');

drop policy if exists "attachments_insert" on storage.objects;
create policy "attachments_insert"
  on storage.objects for insert
  to public
  with check (bucket_id = 'attachments');

drop policy if exists "attachments_update" on storage.objects;
create policy "attachments_update"
  on storage.objects for update
  to public
  using (bucket_id = 'attachments')
  with check (bucket_id = 'attachments');

drop policy if exists "attachments_delete" on storage.objects;
create policy "attachments_delete"
  on storage.objects for delete
  to public
  using (bucket_id = 'attachments');

notify pgrst, 'reload schema';
