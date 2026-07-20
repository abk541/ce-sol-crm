-- Run as the native cluster postgres superuser after restoring the five app
-- schemas with --no-owner --no-privileges and --role=app_owner.

begin;

revoke all on database ce_crm from public;
grant connect on database ce_crm to app_runtime;

revoke all on schema public, private, app_auth, app_files, app_events from public;
revoke create on schema public from public;
revoke all on all tables in schema public, private, app_auth, app_files, app_events from public;
revoke all on all sequences in schema public, private, app_auth, app_files, app_events from public;
revoke all on all functions in schema public, private, app_auth, app_files, app_events from public;

grant usage on schema public, private, app_auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Authentication/profile administration is API-only. Browser-originated data
-- calls may read only the profile directory fields consumed by the SPA.
revoke all on table public.users from authenticated;
grant select (
  id, auth_user_id, name, email, username, role, avatar, status, first_login,
  mfa_enabled, created_at, team, manager_id
) on public.users to authenticated;

grant usage, select on sequence public.bd_submissions_id_seq to authenticated;
grant execute on function app_auth.request_account_id() to authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.has_any_permission(text[]) to authenticated;

grant usage on schema public, private, app_auth, app_files, app_events to app_runtime;
grant select, insert, update, delete on public.users to app_runtime;
grant select, insert, update, delete on app_auth.accounts, app_auth.sessions to app_runtime;
grant select, insert, update, delete on app_files.objects to app_runtime;
grant select on app_events.outbox to app_runtime;
grant usage, select on sequence app_events.outbox_id_seq to app_runtime;
grant execute on function app_auth.request_account_id() to app_runtime;
grant execute on function private.effective_permission_for_auth_user(uuid, text) to app_runtime;

alter default privileges for role app_owner in schema public, private, app_auth, app_files, app_events
  revoke execute on functions from public;
alter default privileges for role app_owner in schema public, private, app_auth, app_files, app_events
  revoke all on tables from public;
alter default privileges for role app_owner in schema public, private, app_auth, app_files, app_events
  revoke all on sequences from public;

commit;
