-- A valid Supabase Auth session is not enough to enter the CRM workspace.
-- Profiles forced through first-login may read their own safe profile so the
-- password-setup screen can render, but every other Data API write/read and
-- every Storage write remains unavailable until setup completes server-side.

begin;

-- This predicate is shared by all existing business-table, settings,
-- permission, and attachment-write policies created during the Auth cutover.
-- Replacing it closes all of those paths atomically without duplicating policy
-- logic across the schema.
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
      and profile.first_login is false
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
      and profile.first_login is false
      and profile.role = 'CAPTURE_MANAGER'
  );
$function$;

revoke all on function private.current_user_is_active() from public, anon, authenticated;
revoke all on function private.current_user_is_admin() from public, anon, authenticated;
grant execute on function private.current_user_is_active() to authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

-- Completed active users retain the collaborative safe-profile directory.
-- A pending user receives only their own row, which is enough to render and
-- retry the first-login flow. No credential columns are granted to the client.
drop policy if exists users_select_active on public.users;
drop policy if exists users_select_completed_active on public.users;
drop policy if exists users_select_own_pending_first_login on public.users;

create policy users_select_completed_active
  on public.users
  for select
  to authenticated
  using ((select private.current_user_is_active()));

create policy users_select_own_pending_first_login
  on public.users
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and status = 'active'
    and first_login is true
  );

-- Completion is a coordinated Auth + profile operation in the protected Edge
-- Function. The browser must never be able to clear this authorization flag
-- directly, even when it owns the profile row.
drop policy if exists users_update_own_first_login on public.users;
revoke update (first_login) on public.users from anon, authenticated;

notify pgrst, 'reload schema';

commit;
