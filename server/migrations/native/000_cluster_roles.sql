-- Run once against the native cluster's postgres database before creating and
-- restoring ce_crm. Passwords are deliberately configured out of band.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_owner') then
    create role app_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$roles$;

alter role app_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role authenticated nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
alter role app_runtime nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;

grant authenticated to app_runtime;
