-- Keep integration secrets out of browser-readable tables and make business
-- attachments private. This migration must run after the first-login gate so
-- private.current_user_is_active() also excludes incomplete accounts.

begin;

-- SAM.gov credentials now live only in the Edge Runtime environment. Retain
-- the two confirmed non-secret workspace settings and reject arbitrary keys.
delete from public.app_settings
where key not in ('non_sub_grace_hours', 'non_sub_grace_minutes');

alter table public.app_settings
  drop constraint if exists app_settings_known_non_secret_key;

alter table public.app_settings
  add constraint app_settings_known_non_secret_key
  check (key in ('non_sub_grace_hours', 'non_sub_grace_minutes'));

-- Private buckets require an authenticated Storage download or a short-lived
-- signed URL. The client uses authenticated download() calls by storagePath.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists attachments_read on storage.objects;
drop policy if exists attachments_insert on storage.objects;
drop policy if exists attachments_update on storage.objects;
drop policy if exists attachments_delete on storage.objects;

create policy attachments_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.current_user_is_active())
  );

create policy attachments_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (select private.current_user_is_active())
  );

create policy attachments_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.current_user_is_active())
  )
  with check (
    bucket_id = 'attachments'
    and (select private.current_user_is_active())
  );

create policy attachments_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.current_user_is_active())
  );

revoke all privileges on storage.objects from public, anon;
grant select, insert, update, delete on storage.objects to authenticated;

notify pgrst, 'reload schema';

commit;
