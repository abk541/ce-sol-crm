-- Future public-schema objects must not silently become browser-accessible.
-- Supabase's base image defines defaults for both postgres and
-- supabase_admin, while the main cutover transaction runs as supabase_admin.
-- Revoke both owners' browser defaults and require future migrations to grant
-- the exact table, sequence, and RPC access they intend.

begin;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public, anon, authenticated;

commit;
