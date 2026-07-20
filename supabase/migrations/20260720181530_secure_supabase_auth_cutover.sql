-- Phase 2: secure the restored CRM schema for Supabase Auth.
--
-- PRECONDITION (intentional): public.users.auth_user_id must already exist and
-- be populated one-to-one with auth.users.id for every profile. Apply the
-- separate Auth-user bootstrap/import before this migration. This migration
-- fails closed when that mapping is incomplete instead of leaving mixed auth.

begin;

do $preflight$
declare
  problem_count bigint;
begin
  if to_regclass('public.users') is null then
    raise exception 'Auth cutover aborted: public.users does not exist';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'auth_user_id'
      and data_type = 'uuid'
  ) then
    raise exception using
      message = 'Auth cutover aborted: public.users.auth_user_id uuid is missing',
      hint = 'Create and populate the Auth-user mapping before applying this migration.';
  end if;

  select count(*) into problem_count
  from public.users
  where auth_user_id is null;

  if problem_count > 0 then
    raise exception 'Auth cutover aborted: % public.users rows have no auth_user_id', problem_count;
  end if;

  select count(*) into problem_count
  from (
    select auth_user_id
    from public.users
    group by auth_user_id
    having count(*) > 1
  ) duplicates;

  if problem_count > 0 then
    raise exception 'Auth cutover aborted: % duplicate auth_user_id mappings exist', problem_count;
  end if;

  select count(*) into problem_count
  from public.users profile
  left join auth.users auth_user on auth_user.id = profile.auth_user_id
  where auth_user.id is null;

  if problem_count > 0 then
    raise exception 'Auth cutover aborted: % profile mappings do not exist in auth.users', problem_count;
  end if;

  select count(*) into problem_count
  from public.users
  where role = 'CAPTURE_MANAGER'
    and status = 'active';

  if problem_count = 0 then
    raise exception 'Auth cutover aborted: at least one active CAPTURE_MANAGER profile is required';
  end if;
end
$preflight$;

-- Make the profile/Auth identity relationship mandatory and one-to-one. Auth
-- deletion cascades through the profile, whose existing dependent FKs then
-- apply their own SET NULL/CASCADE behavior.
alter table public.users
  drop constraint if exists users_auth_user_id_fkey,
  drop constraint if exists users_auth_user_id_key;

drop index if exists public.users_auth_user_id_bootstrap_unique_idx;

alter table public.users
  alter column auth_user_id set not null,
  add constraint users_auth_user_id_key unique (auth_user_id),
  add constraint users_auth_user_id_fkey
    foreign key (auth_user_id)
    references auth.users (id)
    on delete cascade;

-- Destroy the legacy credential material. Supabase Auth is the only credential
-- authority after this point. Columns remain temporarily so a staged frontend
-- deployment does not fail schema decoding, but no browser role can read or
-- write them.
alter table public.users
  alter column password set default null,
  alter column mfa_secret set default null,
  alter column mfa_recovery_codes drop not null,
  alter column mfa_recovery_codes set default null;

update public.users
set password = null,
    mfa_secret = null,
    mfa_recovery_codes = null,
    mfa_enabled = false,
    -- Every legacy password was previously browser-readable. Force all mapped
    -- users through the new Supabase Auth password-change flow, not only the
    -- two profiles whose old first_login flag happened to be true.
    first_login = true;

-- Privileged RLS predicates live outside the exposed public schema. They are
-- SECURITY DEFINER to avoid recursive public.users RLS evaluation, have an
-- empty search_path, and perform authorization from server-owned profile data
-- rather than user-editable JWT metadata.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users profile
    where profile.auth_user_id = (select auth.uid())
      and profile.status = 'active'
  );
$function$;

create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users profile
    where profile.auth_user_id = (select auth.uid())
      and profile.status = 'active'
      and profile.role = 'CAPTURE_MANAGER'
  );
$function$;

-- Friendly Edge Function checks prevent normal self/last-admin lockout. This
-- deferred database invariant closes the concurrent-request race as well, and
-- also protects maintenance performed with privileged database roles.
create or replace function private.ensure_active_capture_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.users profile
    where profile.role = 'CAPTURE_MANAGER'
      and profile.status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      message = 'At least one active CAPTURE_MANAGER profile is required.';
  end if;
  return null;
end
$function$;

revoke all on function private.current_user_is_active() from public, anon, authenticated;
revoke all on function private.current_user_is_admin() from public, anon, authenticated;
revoke all on function private.ensure_active_capture_manager() from public, anon, authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

drop trigger if exists users_keep_active_capture_manager on public.users;
create constraint trigger users_keep_active_capture_manager
after insert or update or delete on public.users
deferrable initially deferred
for each row
execute function private.ensure_active_capture_manager();

-- Remove every legacy public-schema allow_all policy, including any restored
-- from the source dump. Do this by catalog rather than assuming policy names
-- are attached to a fixed table list.
do $drop_open_policies$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'allow_all_%'
  loop
    execute format(
      'drop policy %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$drop_open_policies$;

-- Remove broad Data API privileges first, then explicitly add back only what
-- each browser role needs. Future public tables receive no implicit browser
-- privileges and therefore require an intentional migration before exposure.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
grant usage on schema public to authenticated;

-- Ordinary CRM data remains collaborative: every active authenticated user
-- has full CRUD, while inactive/missing profiles immediately lose access even
-- if an older JWT has not expired yet.
do $business_tables$
declare
  table_name text;
begin
  foreach table_name in array array[
    'activity_logs',
    'bd_submissions',
    'comments',
    'contract_invoices',
    'contract_line_items',
    'contract_pocs',
    'contract_vehicle_orders',
    'contracts',
    'deletion_requests',
    'employee_requests',
    'employees',
    'fresh_awards',
    'government_warnings',
    'locked_subcontractors',
    'non_submission_reports',
    'notifications',
    'opportunities',
    'past_performances',
    'subcontractors',
    'subk_database'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Auth cutover aborted: required table public.% is missing', table_name;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select private.current_user_is_active())) with check ((select private.current_user_is_active()))',
      'active_authenticated_' || table_name,
      table_name
    );
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      table_name
    );
  end loop;
end
$business_tables$;

-- The one serial insert path needs sequence access; do not grant future or
-- extension-owned sequences implicitly.
grant usage, select on sequence public.bd_submissions_id_seq to authenticated;

-- Profiles are readable only to active users and only through a safe explicit
-- column list. All account mutations go through manage-users, which keeps Auth
-- and the profile row synchronized with the server-side service role.
alter table public.users enable row level security;
drop policy if exists users_select_active on public.users;
drop policy if exists users_update_own_first_login on public.users;
create policy users_select_active
  on public.users
  for select
  to authenticated
  using ((select private.current_user_is_active()));

-- first_login is UI state, not an authorization input. An active user may
-- clear/update only that column on their own mapped profile; every account and
-- role field remains service-role-only through manage-users.
create policy users_update_own_first_login
  on public.users
  for update
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and (select private.current_user_is_active())
  )
  with check (
    auth_user_id = (select auth.uid())
    and (select private.current_user_is_active())
  );

grant select (
  id,
  auth_user_id,
  name,
  email,
  username,
  role,
  avatar,
  status,
  first_login,
  mfa_enabled,
  created_at,
  team,
  manager_id
) on public.users to authenticated;

grant update (first_login) on public.users to authenticated;

revoke select (password, mfa_secret, mfa_recovery_codes)
  on public.users from anon, authenticated;
revoke update (password, mfa_secret, mfa_recovery_codes)
  on public.users from anon, authenticated;

-- All active users may load runtime settings and effective permission data;
-- only an active Capture Manager may change either. These direct writes still
-- pass server-enforced RLS even if the frontend permission checks are bypassed.
alter table public.app_settings enable row level security;
drop policy if exists app_settings_select_active on public.app_settings;
drop policy if exists app_settings_write_admin on public.app_settings;
create policy app_settings_select_active
  on public.app_settings
  for select
  to authenticated
  using ((select private.current_user_is_active()));
create policy app_settings_write_admin
  on public.app_settings
  for all
  to authenticated
  using ((select private.current_user_is_admin()))
  with check ((select private.current_user_is_admin()));
grant select, insert, update, delete on public.app_settings to authenticated;

alter table public.role_permission_overrides enable row level security;
drop policy if exists role_permissions_select_active on public.role_permission_overrides;
drop policy if exists role_permissions_write_admin on public.role_permission_overrides;
create policy role_permissions_select_active
  on public.role_permission_overrides
  for select
  to authenticated
  using ((select private.current_user_is_active()));
create policy role_permissions_write_admin
  on public.role_permission_overrides
  for all
  to authenticated
  using ((select private.current_user_is_admin()))
  with check ((select private.current_user_is_admin()));
grant select, insert, update, delete on public.role_permission_overrides to authenticated;

alter table public.user_permission_overrides enable row level security;
drop policy if exists user_permissions_select_active on public.user_permission_overrides;
drop policy if exists user_permissions_write_admin on public.user_permission_overrides;
create policy user_permissions_select_active
  on public.user_permission_overrides
  for select
  to authenticated
  using ((select private.current_user_is_active()));
create policy user_permissions_write_admin
  on public.user_permission_overrides
  for all
  to authenticated
  using ((select private.current_user_is_admin()))
  with check ((select private.current_user_is_admin()));
grant select, insert, update, delete on public.user_permission_overrides to authenticated;

-- Attachments keep stable public URLs. Anonymous users can only read/list this
-- public bucket; uploads, upserts, and deletes require an active Auth profile.
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do update
set name = excluded.name,
    public = true;

drop policy if exists attachments_read on storage.objects;
drop policy if exists attachments_insert on storage.objects;
drop policy if exists attachments_update on storage.objects;
drop policy if exists attachments_delete on storage.objects;

create policy attachments_read
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'attachments');

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

revoke insert, update, delete on storage.objects from anon;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

notify pgrst, 'reload schema';

commit;
