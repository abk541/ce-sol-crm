-- Prepare the existing PostgreSQL database for the custom Node API while the
-- self-hosted Supabase-compatible services remain available as a rollback.
-- This migration is additive and idempotent. Run it as the database owner.

begin;

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  else
    alter role app_runtime noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$role$;

-- The deployment administrator enables LOGIN and sets a generated password in
-- a root-owned environment file after this migration. No secret belongs in SQL.
comment on role app_runtime is
  'Least-privilege CRM API role. Enable LOGIN and set its password out of band.';

create schema if not exists app_auth;
create schema if not exists app_files;
create schema if not exists app_events;

revoke all on schema app_auth, app_files, app_events from public;
revoke all on schema app_auth, app_files, app_events from anon, authenticated;

create table if not exists app_auth.accounts (
  id uuid primary key,
  email text not null,
  encrypted_password text not null,
  password_version integer not null default 1 check (password_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

create unique index if not exists accounts_normalized_email_key
  on app_auth.accounts (lower(email));

create table if not exists app_auth.sessions (
  id uuid primary key,
  account_id uuid not null references app_auth.accounts(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  password_version integer not null check (password_version > 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  user_agent text,
  remote_address inet,
  check (expires_at > created_at)
);

create index if not exists sessions_account_active_idx
  on app_auth.sessions (account_id, expires_at)
  where revoked_at is null;
create index if not exists sessions_expiry_idx
  on app_auth.sessions (expires_at);

-- Copy existing GoTrue bcrypt hashes without changing them. DO NOTHING is
-- intentional: rerunning this migration must never overwrite a password that
-- has since been changed through the custom API.
insert into app_auth.accounts (id, email, encrypted_password, created_at, updated_at, last_sign_in_at)
select auth_user.id,
       lower(auth_user.email),
       auth_user.encrypted_password,
       coalesce(auth_user.created_at, now()),
       coalesce(auth_user.updated_at, auth_user.created_at, now()),
       auth_user.last_sign_in_at
  from auth.users auth_user
 where auth_user.email is not null
   and auth_user.encrypted_password is not null
on conflict (id) do nothing;

do $credential_preflight$
declare
  missing_count bigint;
begin
  select count(*) into missing_count
    from public.users profile
    left join app_auth.accounts account on account.id = profile.auth_user_id
   where account.id is null;
  if missing_count > 0 then
    raise exception
      'Native API preparation aborted: % profile credential(s) were not copied',
      missing_count;
  end if;
end
$credential_preflight$;

-- Keep the old auth.users FK during the reversible preparation phase. The new
-- FK is added alongside it; migration 002 removes only the old dependency at
-- the final API cutover.
do $account_fk$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.users'::regclass
       and conname = 'users_app_auth_account_fkey'
  ) then
    alter table public.users
      add constraint users_app_auth_account_fkey
      foreign key (auth_user_id)
      references app_auth.accounts(id)
      on delete cascade;
  end if;
end
$account_fk$;

-- Neutral identity helper: custom API transactions use app.account_id, while
-- the existing PostgREST rollback path continues to work from standard JWT
-- claim GUCs. No helper depends on the Supabase auth schema.
create or replace function app_auth.request_account_id()
returns uuid
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    nullif(pg_catalog.current_setting('app.account_id', true), ''),
    nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), ''),
    nullif(
      (nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'),
      ''
    )
  )::uuid;
$function$;

revoke all on function app_auth.request_account_id() from public, anon, authenticated, app_runtime;
grant usage on schema app_auth to authenticated, app_runtime;
grant execute on function app_auth.request_account_id() to authenticated, app_runtime;

create or replace function private.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.users profile
     where profile.auth_user_id = app_auth.request_account_id()
       and profile.status = 'active'
       and profile.first_login is false
  );
$function$;

create or replace function private.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.effective_permission_for_auth_user(
    app_auth.request_account_id(),
    requested_permission
  );
$function$;

create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select private.has_permission('admin:manageUsers');
$function$;

revoke all on function private.current_user_is_active() from public, anon, authenticated, app_runtime;
revoke all on function private.has_permission(text) from public, anon, authenticated, app_runtime;
revoke all on function private.current_user_is_admin() from public, anon, authenticated, app_runtime;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;
grant execute on function private.effective_permission_for_auth_user(uuid, text) to app_runtime;

-- Replace the remaining direct auth.uid() pending-profile policy with the
-- neutral helper. Completed profiles continue through current_user_is_active.
drop policy if exists users_select_own_pending_first_login on public.users;
create policy users_select_own_pending_first_login
  on public.users
  for select
  to authenticated
  using (
    auth_user_id = app_auth.request_account_id()
    and status = 'active'
    and first_login is true
  );

-- The API itself requires privileged profile access for authentication and
-- atomic administrator workflows. Browser data calls always SET LOCAL ROLE
-- authenticated, so they continue through the existing RLS policies.
grant usage on schema public, private to app_runtime;
grant select, insert, update, delete on public.users to app_runtime;
drop policy if exists app_runtime_profile_access on public.users;
create policy app_runtime_profile_access
  on public.users
  for all
  to app_runtime
  using (true)
  with check (true);

grant usage on schema app_auth to app_runtime;
grant select, insert, update, delete on app_auth.accounts, app_auth.sessions to app_runtime;
revoke truncate, references, trigger on app_auth.accounts, app_auth.sessions from app_runtime;

create table if not exists app_files.objects (
  storage_path text primary key check (length(storage_path) between 1 and 1024),
  object_key uuid not null unique,
  attachment_id text not null check (length(attachment_id) between 1 and 128),
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  attached_at timestamptz not null default now(),
  uploaded_by uuid references app_auth.accounts(id) on delete set null,
  content_available boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table app_files.objects add column if not exists attachment_id text;
update app_files.objects
   set attachment_id = coalesce(
     substring(pg_catalog.regexp_replace(storage_path, '^.*/', '') from
       '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})-'),
     object_key::text
   )
 where attachment_id is null;
alter table app_files.objects alter column attachment_id set not null;

create index if not exists file_objects_uploader_idx on app_files.objects (uploaded_by);
grant usage on schema app_files to app_runtime;
grant select, insert, update, delete on app_files.objects to app_runtime;
revoke truncate, references, trigger on app_files.objects from app_runtime;

-- Preserve metadata for old private Storage objects even when source billing
-- prevented their bytes from being downloaded. These rows return an explicit
-- file_content_unavailable response until bytes are recovered.
do $legacy_storage_metadata$
begin
  if to_regclass('storage.objects') is not null then
    execute $sql$
      insert into app_files.objects
        (storage_path, object_key, attachment_id, original_name, content_type, size_bytes,
         attached_at, uploaded_by, content_available)
      select object.name,
             gen_random_uuid(),
             coalesce(
               substring(pg_catalog.regexp_replace(object.name, '^.*/', '') from
                 '^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})-'),
               gen_random_uuid()::text
             ),
             pg_catalog.regexp_replace(object.name, '^.*/', ''),
             object.metadata ->> 'mimetype',
             case
               when (object.metadata ->> 'size') ~ '^[0-9]+$'
                 then (object.metadata ->> 'size')::bigint
               else 0
             end,
             coalesce(object.created_at, now()),
             case
               when object.owner_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                and exists (
                  select 1 from app_auth.accounts account
                   where account.id::text = object.owner_id::text
                )
                 then object.owner_id::text::uuid
               else null
             end,
             false
        from storage.objects object
       where object.bucket_id = 'attachments'
      on conflict (storage_path) do nothing
    $sql$;
  end if;
end
$legacy_storage_metadata$;

create table if not exists app_events.outbox (
  id bigint generated always as identity primary key,
  topic text not null,
  entity_id text,
  actor_account_id uuid,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_row jsonb,
  new_row jsonb,
  created_at timestamptz not null default now()
);

-- These additive clauses let installations created from an earlier preview of
-- this migration gain the mutation journal without losing their outbox.
alter table app_events.outbox add column if not exists operation text;
alter table app_events.outbox add column if not exists old_row jsonb;
alter table app_events.outbox add column if not exists new_row jsonb;

create index if not exists outbox_created_at_idx on app_events.outbox (created_at);

create or replace function app_events.capture_public_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_id bigint;
  row_json jsonb;
begin
  row_json := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into app_events.outbox
    (topic, entity_id, actor_account_id, operation, old_row, new_row)
  values (
    tg_table_name || '.changed',
    row_json ->> 'id',
    app_auth.request_account_id(),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  )
  returning id into event_id;
  perform pg_catalog.pg_notify('app_events', event_id::text);
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;

revoke all on function app_events.capture_public_change() from public, anon, authenticated, app_runtime;

do $change_triggers$
declare
  table_name text;
begin
  foreach table_name in array array[
    'activity_logs', 'app_settings', 'bd_submissions', 'comments',
    'contract_invoices', 'contract_line_items', 'contract_pocs',
    'contract_vehicle_orders', 'contracts', 'deletion_requests',
    'employee_requests', 'employees', 'fresh_awards', 'government_warnings',
    'locked_subcontractors', 'non_submission_reports', 'notifications',
    'opportunities', 'past_performances', 'role_permission_overrides',
    'subcontractors', 'subk_database', 'user_permission_overrides', 'users'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists app_events_capture_change on public.%I', table_name);
      execute format(
        'create trigger app_events_capture_change after insert or update or delete on public.%I for each row execute function app_events.capture_public_change()',
        table_name
      );
    end if;
  end loop;
end
$change_triggers$;

grant usage on schema app_events to app_runtime;
grant select on app_events.outbox to app_runtime;
grant usage, select on sequence app_events.outbox_id_seq to app_runtime;

-- app_runtime can shed its service privileges for each browser-originated data
-- transaction; existing table grants and RLS policies then remain authoritative.
grant authenticated to app_runtime;

-- Foreign-key indexes used by common joins and cascading maintenance. Each is
-- harmless on repeat and avoids table-wide scans as the restored data grows.
create index if not exists comments_opportunity_id_idx on public.comments (opportunity_id);
create index if not exists contract_pocs_contract_id_idx on public.contract_pocs (contract_id);
create index if not exists contract_invoices_contract_id_idx on public.contract_invoices (contract_id);
create index if not exists contract_line_items_contract_id_idx on public.contract_line_items (contract_id);
create index if not exists contract_vehicle_orders_contract_id_idx on public.contract_vehicle_orders (contract_id);
create index if not exists government_warnings_contract_id_idx on public.government_warnings (contract_id);
create index if not exists locked_subcontractors_contract_id_idx on public.locked_subcontractors (contract_id);
create index if not exists deletion_requests_opportunity_id_idx on public.deletion_requests (opportunity_id);
create index if not exists users_manager_id_idx on public.users (manager_id);

commit;
