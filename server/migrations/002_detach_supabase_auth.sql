-- Final cutover step. Apply only after migration 001, the custom API, and a
-- fresh encrypted backup have all been validated. This removes the profile's
-- last foreign-key dependency on auth.users; it does not drop any Supabase
-- schema or data, so rollback evidence remains intact.

begin;

do $preflight$
declare
  missing_count bigint;
begin
  select count(*) into missing_count
    from public.users profile
    left join app_auth.accounts account on account.id = profile.auth_user_id
   where account.id is null;
  if missing_count > 0 then
    raise exception 'Auth detachment aborted: % profile account mapping(s) are missing', missing_count;
  end if;
end
$preflight$;

-- The historical migration used this name for the auth.users FK. Drop only a
-- constraint that actually references auth.users, preserving the new app_auth
-- FK regardless of local naming differences.
do $drop_old_auth_fk$
declare
  constraint_row record;
begin
  for constraint_row in
    select constraint_info.conname
      from pg_constraint constraint_info
      join pg_class referenced_table on referenced_table.oid = constraint_info.confrelid
      join pg_namespace referenced_schema on referenced_schema.oid = referenced_table.relnamespace
     where constraint_info.conrelid = 'public.users'::regclass
       and constraint_info.contype = 'f'
       and referenced_schema.nspname = 'auth'
       and referenced_table.relname = 'users'
  loop
    execute format('alter table public.users drop constraint %I', constraint_row.conname);
  end loop;
end
$drop_old_auth_fk$;

comment on column public.users.auth_user_id is
  'Stable application account UUID referencing app_auth.accounts; retained name avoids a breaking data migration.';

commit;
