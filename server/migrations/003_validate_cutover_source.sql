-- Read-only gate for the frozen source after 002_detach_supabase_auth.sql.
-- It proves the five exported application schemas no longer depend on the
-- retired auth schema and emits a non-secret credential fingerprint for the
-- native restore comparison.

\set ON_ERROR_STOP on

do $validation$
declare
  profile_count bigint;
  account_count bigint;
  credential_mismatch_count bigint;
  auth_fk_count bigint;
  app_auth_fk_count bigint;
  textual_auth_dependency_count bigint;
  outbox_trigger_count bigint;
begin
  select count(*) into profile_count from public.users;
  select count(*) into account_count from app_auth.accounts;
  select count(*)
    into credential_mismatch_count
    from public.users profile
    left join app_auth.accounts account on account.id = profile.auth_user_id
    left join auth.users legacy_account on legacy_account.id = profile.auth_user_id
   where account.id is null
      or legacy_account.id is null
      or account.encrypted_password is distinct from legacy_account.encrypted_password;

  if profile_count <> account_count or credential_mismatch_count <> 0 then
    raise exception
      'Credential migration validation failed (profiles %, accounts %, mismatches %)',
      profile_count, account_count, credential_mismatch_count;
  end if;

  select count(*) filter (where referenced_namespace.nspname = 'auth'),
         count(*) filter (where referenced_namespace.nspname = 'app_auth')
    into auth_fk_count, app_auth_fk_count
    from pg_constraint constraint_row
    join pg_class referenced_table on referenced_table.oid = constraint_row.confrelid
    join pg_namespace referenced_namespace on referenced_namespace.oid = referenced_table.relnamespace
   where constraint_row.conrelid = 'public.users'::regclass
     and constraint_row.contype = 'f';

  if auth_fk_count <> 0 or app_auth_fk_count <> 1 then
    raise exception
      'Unexpected account foreign keys after detachment (auth %, app_auth %)',
      auth_fk_count, app_auth_fk_count;
  end if;

  select count(*)
    into textual_auth_dependency_count
    from (
      select pg_get_functiondef(function_row.oid) as definition
       from pg_proc function_row
        join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
       where namespace_row.nspname in ('public', 'private', 'app_auth', 'app_files', 'app_events')
         and function_row.prokind in ('f', 'p')
      union all
      select coalesce(policy_row.polqual::text, '') || ' ' || coalesce(policy_row.polwithcheck::text, '')
        from pg_policy policy_row
        join pg_class table_row on table_row.oid = policy_row.polrelid
        join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
       where namespace_row.nspname in ('public', 'private', 'app_auth', 'app_files', 'app_events')
      union all
      select pg_get_viewdef(view_row.oid)
        from pg_class view_row
        join pg_namespace namespace_row on namespace_row.oid = view_row.relnamespace
       where namespace_row.nspname in ('public', 'private', 'app_auth', 'app_files', 'app_events')
         and view_row.relkind in ('v', 'm')
    ) definitions
   where definition ~ '(^|[^a-zA-Z0-9_])auth\.';

  if textual_auth_dependency_count <> 0 then
    raise exception 'Found % remaining auth-schema references', textual_auth_dependency_count;
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
    raise exception 'Expected 24 public outbox triggers, found %', outbox_trigger_count;
  end if;
end
$validation$;

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
