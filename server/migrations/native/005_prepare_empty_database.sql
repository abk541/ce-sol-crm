-- Run only against a newly created, empty ce_crm database immediately before
-- pg_restore. The managed source dump contains its own public schema entry,
-- while template0 already supplies an empty public schema.

\set ON_ERROR_STOP on

do $safety$
begin
  if current_database() <> 'ce_crm' then
    raise exception 'Refusing to prepare unexpected database %', current_database();
  end if;

  if exists (
    select 1
      from pg_class table_row
      join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
     where namespace_row.nspname = 'public'
       and table_row.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
  ) then
    raise exception 'Refusing to alter a database that already contains user objects';
  end if;

  if exists (
    select 1
      from pg_namespace
     where nspname <> 'public'
       and nspname <> 'information_schema'
       and nspname !~ '^pg_'
  ) then
    raise exception 'Refusing to alter a database that already contains user schemas';
  end if;
end
$safety$;

drop schema public;
