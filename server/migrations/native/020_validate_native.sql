\set ON_ERROR_STOP on

do $validation$
declare
  profile_count bigint;
  account_count bigint;
  orphan_count bigint;
  auth_fk_count bigint;
  app_auth_fk_count bigint;
  outbox_trigger_count bigint;
  invalid_constraint_count bigint;
  unsafe_setting_count bigint;
  public_table_count bigint;
  rls_disabled_count bigint;
begin
  if to_regnamespace('auth') is not null
     or to_regnamespace('storage') is not null
     or to_regnamespace('realtime') is not null then
    raise exception 'A retired Supabase service schema exists in the native database';
  end if;

  select count(*) into profile_count from public.users;
  select count(*) into account_count from app_auth.accounts;
  select count(*)
    into orphan_count
    from public.users u
    left join app_auth.accounts a on a.id = u.auth_user_id
   where a.id is null;

  if profile_count <> account_count or orphan_count <> 0 then
    raise exception
      'Account/profile validation failed (profiles %, accounts %, orphans %)',
      profile_count, account_count, orphan_count;
  end if;

  select count(*) filter (where referenced_namespace.nspname = 'auth'),
         count(*) filter (where referenced_namespace.nspname = 'app_auth')
    into auth_fk_count, app_auth_fk_count
    from pg_constraint constraint_row
    join pg_class referenced_table
      on referenced_table.oid = constraint_row.confrelid
    join pg_namespace referenced_namespace
      on referenced_namespace.oid = referenced_table.relnamespace
   where constraint_row.conrelid = 'public.users'::regclass
     and constraint_row.contype = 'f';

  if auth_fk_count <> 0 or app_auth_fk_count <> 1 then
    raise exception
      'Unexpected account foreign keys (auth %, app_auth %)',
      auth_fk_count, app_auth_fk_count;
  end if;

  select count(*)
    into outbox_trigger_count
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
   where namespace_row.nspname = 'public'
     and trigger_row.tgname = 'app_events_capture_change'
     and not trigger_row.tgisinternal;

  if outbox_trigger_count <> 24 then
    raise exception 'Expected 24 outbox triggers, found %', outbox_trigger_count;
  end if;

  select count(*)
    into invalid_constraint_count
    from pg_constraint
   where not convalidated
     and connamespace in (
       'public'::regnamespace,
       'private'::regnamespace,
       'app_auth'::regnamespace,
       'app_files'::regnamespace,
       'app_events'::regnamespace
     );

  if invalid_constraint_count <> 0 then
    raise exception 'Found % unvalidated constraints', invalid_constraint_count;
  end if;

  select count(*)
    into unsafe_setting_count
    from public.app_settings
   where key not in ('non_sub_grace_hours', 'non_sub_grace_minutes');

  if unsafe_setting_count <> 0 then
    raise exception 'Found % app settings outside the browser-safe allowlist', unsafe_setting_count;
  end if;

  select count(*), count(*) filter (where not table_row.relrowsecurity)
    into public_table_count, rls_disabled_count
    from pg_class table_row
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
   where namespace_row.nspname = 'public'
     and table_row.relkind = 'r';

  if public_table_count <> 24 or rls_disabled_count <> 0 then
    raise exception
      'Unexpected public-table/RLS state (tables %, RLS disabled %)',
      public_table_count, rls_disabled_count;
  end if;

  if exists (
    select 1
      from pg_roles
     where rolname = 'app_runtime'
       and (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
  ) then
    raise exception 'app_runtime has an unsafe cluster privilege';
  end if;
end
$validation$;

select
  (select count(*) from public.users) as profiles,
  (select count(*) from app_auth.accounts) as accounts,
  (select count(*) from app_auth.sessions) as sessions,
  (select count(*) from app_files.objects) as file_records,
  (select count(*) from app_events.outbox) as queued_events;

select
  count(*) as accounts,
  md5(string_agg(id::text || ':' || encrypted_password, '|' order by id)) as credential_fingerprint
from app_auth.accounts;

select format(
  'select %L as table_name, count(*) as row_count from %I.%I;',
  tablename,
  schemaname,
  tablename
)
from pg_tables
where schemaname = 'public'
order by tablename
\gexec

select
  role,
  count(*) as users,
  count(*) filter (
    where private.effective_permission_for_auth_user(auth_user_id, 'admin:manageUsers')
  ) as administrators
from public.users
group by role
order by role;
