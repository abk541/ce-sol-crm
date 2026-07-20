-- Enforce the application's existing coarse permission model at the database boundary.
--
-- Compatibility note: completed, active users retain read access to every row in the
-- business tables loaded by the client. Mutations are now gated by the nearest
-- existing application permission. These policies intentionally remain table-level;
-- they do not yet enforce row ownership, assignment, tenant, recipient, or column-
-- specific rules. Those require a later application-aware hardening pass.

begin;

create or replace function private.effective_permission_for_auth_user(
  caller_auth_user_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      coalesce(user_override.grants ? requested_permission, false)
      or (
        (
          case
            -- A stored role override replaces the role defaults, including when
            -- the stored permission array is empty.
            when role_override.role is not null then
              coalesce(role_override.permissions ? requested_permission, false)
            else
              case profile.role
                when 'CAPTURE_MANAGER' then requested_permission = any (array[
                  'admin:manageUsers',
                  'opportunity:create',
                  'opportunity:read',
                  'opportunity:edit',
                  'opportunity:editSchedule',
                  'opportunity:comment',
                  'opportunity:submitProposal',
                  'opportunity:assign',
                  'opportunity:cancel',
                  'opportunity:deleteRequest',
                  'opportunity:deleteApprove',
                  'sourcing:read',
                  'sourcing:write',
                  'nonSubmission:submit',
                  'nonSubmission:viewAll',
                  'nonSubmission:review',
                  'contract:read',
                  'contract:edit',
                  'contract:comment',
                  'contract:allCommChannels',
                  'operations:manage',
                  'pastPerformance:manage',
                  'hr:manageCertifications',
                  'hr:viewCertifications',
                  'hr:reviewRequests',
                  'goals:manage',
                  'comment:editAny'
                ]::text[])
                when 'BD_MANAGER' then requested_permission = any (array[
                  'opportunity:read',
                  'opportunity:comment',
                  'opportunity:submitProposal',
                  'opportunity:assign',
                  'opportunity:deleteRequest',
                  'sourcing:read',
                  'sourcing:write',
                  'nonSubmission:submit',
                  'hr:viewCertifications'
                ]::text[])
                when 'TEAM_LEAD' then requested_permission = any (array[
                  'opportunity:read',
                  'opportunity:editSchedule',
                  'opportunity:comment',
                  'opportunity:submitProposal',
                  'opportunity:assign',
                  'opportunity:deleteRequest',
                  'sourcing:read',
                  'sourcing:write',
                  'nonSubmission:submit',
                  'hr:viewCertifications'
                ]::text[])
                when 'ASSOCIATE' then requested_permission = any (array[
                  'opportunity:read',
                  'opportunity:editSchedule',
                  'opportunity:comment',
                  'opportunity:submitProposal',
                  'opportunity:deleteRequest',
                  'sourcing:read',
                  'sourcing:write',
                  'contract:comment',
                  'nonSubmission:submit',
                  'hr:viewCertifications'
                ]::text[])
                when 'OPS_MANAGER' then requested_permission = any (array[
                  'contract:read',
                  'contract:edit',
                  'contract:comment',
                  'contract:allCommChannels',
                  'operations:manage',
                  'pastPerformance:manage',
                  'hr:viewCertifications'
                ]::text[])
                else false
              end
          end
        )
        and not coalesce(user_override.revokes ? requested_permission, false)
      )
    from public.users as profile
    left join public.role_permission_overrides as role_override
      on role_override.role = profile.role
    left join public.user_permission_overrides as user_override
      on user_override.user_id = profile.id
    where profile.auth_user_id = caller_auth_user_id
      and profile.status = 'active'
      and profile.first_login is false
  ), false);
$$;

comment on function private.effective_permission_for_auth_user(uuid, text) is
  'Internal UUID-parameter permission evaluator. Role overrides replace defaults, user revokes remove base permissions, user grants win, and inactive/first-login profiles are denied.';

revoke all on function private.effective_permission_for_auth_user(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function private.has_permission(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.effective_permission_for_auth_user(
    (select auth.uid()),
    requested_permission
  );
$$;

comment on function private.has_permission(text) is
  'Current-session permission check backed by the shared effective-permission evaluator.';

revoke all on function private.has_permission(text) from public, anon, authenticated;
grant execute on function private.has_permission(text) to authenticated;

-- Service-side authorization bridge for trusted Edge Functions. It is deliberately
-- exposed in public for PostgREST RPC discovery, but browser roles cannot execute it.
-- service_role is trusted to supply the UUID obtained from the verified bearer token.
create or replace function public.service_role_has_user_permission(
  caller_auth_user_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.effective_permission_for_auth_user(
    caller_auth_user_id,
    requested_permission
  );
$$;

comment on function public.service_role_has_user_permission(uuid, text) is
  'Service-role-only RPC for checking a verified caller UUID against the same effective permission rules used by RLS.';

revoke all on function public.service_role_has_user_permission(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_role_has_user_permission(uuid, text)
  to service_role;

-- Companion check for user-management flows that are about to remove, deactivate,
-- reset, or change the permissions of one profile. public.users.id is text, so the
-- exclusion parameter deliberately matches that application identifier type.
create or replace function public.service_role_has_other_admin(
  excluded_profile_id text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users as profile
    where profile.id is distinct from excluded_profile_id
      and private.effective_permission_for_auth_user(
        profile.auth_user_id,
        'admin:manageUsers'
      )
  );
$$;

comment on function public.service_role_has_other_admin(text) is
  'Service-role-only RPC that reports whether another completed active profile retains effective admin:manageUsers permission.';

revoke all on function public.service_role_has_other_admin(text)
  from public, anon, authenticated, service_role;
grant execute on function public.service_role_has_other_admin(text)
  to service_role;

create or replace function private.has_any_permission(requested_permissions text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.unnest(requested_permissions) as requested(permission)
    where private.has_permission(requested.permission)
  );
$$;

comment on function private.has_any_permission(text[]) is
  'Policy helper that succeeds when the current authenticated profile has any requested application permission.';

revoke all on function private.has_any_permission(text[]) from public, anon, authenticated;
grant execute on function private.has_any_permission(text[]) to authenticated;

-- Keep the legacy helper used by existing settings policies, but make it honor
-- the same role/user override semantics as the frontend.
create or replace function private.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('admin:manageUsers');
$$;

revoke all on function private.current_user_is_admin() from public, anon, authenticated;
grant execute on function private.current_user_is_admin() to authenticated;

-- Latch the last-effective-admin invariant after the first active Capture Manager
-- completes first login. Before that bootstrap event every migrated real profile can
-- legitimately be first_login=true, so requiring an effective admin would make the
-- cutover impossible. The latch never moves back to false.
create table if not exists private.rbac_invariant_state (
  singleton boolean primary key default true check (singleton),
  effective_admin_required boolean not null default false
);

revoke all privileges on table private.rbac_invariant_state
  from public, anon, authenticated, service_role;

insert into private.rbac_invariant_state (singleton, effective_admin_required)
values (
  true,
  exists (
    select 1
    from public.users as profile
    where profile.role = 'CAPTURE_MANAGER'
      and profile.status = 'active'
      and profile.first_login is false
  )
)
on conflict (singleton) do update
set effective_admin_required =
  private.rbac_invariant_state.effective_admin_required
  or excluded.effective_admin_required;

create or replace function private.assert_effective_admin_invariant()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_required boolean;
begin
  -- This row lock serializes concurrent transactions that could otherwise each
  -- remove a different administrator after observing the other one.
  select state.effective_admin_required
  into admin_required
  from private.rbac_invariant_state as state
  where state.singleton
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'RBAC invariant state is missing; administrator safety cannot be verified.';
  end if;

  if not admin_required and exists (
    select 1
    from public.users as profile
    where profile.role = 'CAPTURE_MANAGER'
      and profile.status = 'active'
      and profile.first_login is false
  ) then
    update private.rbac_invariant_state
    set effective_admin_required = true
    where singleton;
    admin_required := true;
  end if;

  if admin_required and not exists (
    select 1
    from public.users as profile
    where private.effective_permission_for_auth_user(
      profile.auth_user_id,
      'admin:manageUsers'
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'At least one completed active user must retain the effective admin:manageUsers permission.';
  end if;
end;
$$;

create or replace function private.ensure_effective_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_effective_admin_invariant();
  return null;
end;
$$;

revoke all on function private.assert_effective_admin_invariant()
  from public, anon, authenticated, service_role;
revoke all on function private.ensure_effective_admin()
  from public, anon, authenticated, service_role;

-- Replace the legacy role/status-only invariant. Effective permission can change
-- through any of these three tables, so all three receive deferred constraint
-- triggers and are evaluated against their final transaction state.
drop trigger if exists users_keep_active_capture_manager on public.users;
drop trigger if exists users_keep_effective_admin on public.users;
drop trigger if exists role_permissions_keep_effective_admin
  on public.role_permission_overrides;
drop trigger if exists user_permissions_keep_effective_admin
  on public.user_permission_overrides;

drop function if exists private.ensure_active_capture_manager();

create constraint trigger users_keep_effective_admin
after insert or update or delete on public.users
deferrable initially deferred
for each row
execute function private.ensure_effective_admin();

create constraint trigger role_permissions_keep_effective_admin
after insert or update or delete on public.role_permission_overrides
deferrable initially deferred
for each row
execute function private.ensure_effective_admin();

create constraint trigger user_permissions_keep_effective_admin
after insert or update or delete on public.user_permission_overrides
deferrable initially deferred
for each row
execute function private.ensure_effective_admin();

-- Validate/latch the current state immediately as well as on future writes.
select private.assert_effective_admin_invariant();

-- Remove the prior all-commands policy and keep compatible SELECT access for all
-- completed active users. Table privileges and RLS must both permit an operation.
do $business_select_policies$
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
  ]::text[]
  loop
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', table_name)) is null then
      raise exception 'Required business table public.% is missing', table_name;
    end if;

    execute pg_catalog.format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute pg_catalog.format(
      'drop policy if exists %I on public.%I',
      'active_authenticated_' || table_name,
      table_name
    );
    execute pg_catalog.format(
      'drop policy if exists rbac_select_completed_active on public.%I',
      table_name
    );
    execute pg_catalog.format(
      'drop policy if exists rbac_insert_authorized on public.%I',
      table_name
    );
    execute pg_catalog.format(
      'drop policy if exists rbac_update_authorized on public.%I',
      table_name
    );
    execute pg_catalog.format(
      'drop policy if exists rbac_delete_authorized on public.%I',
      table_name
    );

    execute pg_catalog.format(
      'revoke all privileges on table public.%I from anon',
      table_name
    );
    execute pg_catalog.format(
      'revoke insert, update, delete on table public.%I from authenticated',
      table_name
    );
    execute pg_catalog.format(
      'grant select on table public.%I to authenticated',
      table_name
    );
    execute pg_catalog.format(
      'create policy rbac_select_completed_active on public.%I for select to authenticated using ((select private.current_user_is_active()))',
      table_name
    );
  end loop;
end;
$business_select_policies$;

-- Compatibility bridge: the current client writes these mirror/audit/delivery
-- tables from many workflows. Completed active users may insert/update them, while
-- destructive cleanup still requires admin:manageUsers. These rows remain spoofable
-- until writes move to trusted triggers or service-side functions.
grant insert, update, delete on table
  public.activity_logs,
  public.notifications,
  public.employees
to authenticated;

create policy rbac_insert_authorized on public.activity_logs
  for insert to authenticated
  with check ((select private.current_user_is_active()));
create policy rbac_update_authorized on public.activity_logs
  for update to authenticated
  using ((select private.current_user_is_active()))
  with check ((select private.current_user_is_active()));
create policy rbac_delete_authorized on public.activity_logs
  for delete to authenticated
  using ((select private.has_permission('admin:manageUsers')));

create policy rbac_insert_authorized on public.notifications
  for insert to authenticated
  with check ((select private.current_user_is_active()));
create policy rbac_update_authorized on public.notifications
  for update to authenticated
  using ((select private.current_user_is_active()))
  with check ((select private.current_user_is_active()));
create policy rbac_delete_authorized on public.notifications
  for delete to authenticated
  using ((select private.has_permission('admin:manageUsers')));

create policy rbac_insert_authorized on public.employees
  for insert to authenticated
  with check ((select private.current_user_is_active()));
create policy rbac_update_authorized on public.employees
  for update to authenticated
  using ((select private.current_user_is_active()))
  with check ((select private.current_user_is_active()));
create policy rbac_delete_authorized on public.employees
  for delete to authenticated
  using ((select private.has_permission('admin:manageUsers')));

-- Any completed active user can submit an employee request; review mutations are
-- restricted to HR reviewers/admins. This remains table-level rather than owner-only.
grant insert, update, delete on table public.employee_requests to authenticated;

create policy rbac_insert_authorized on public.employee_requests
  for insert to authenticated
  with check ((select private.current_user_is_active()));
create policy rbac_update_authorized on public.employee_requests
  for update to authenticated
  using ((select private.has_any_permission(array[
    'admin:manageUsers',
    'hr:reviewRequests'
  ]::text[])))
  with check ((select private.has_any_permission(array[
    'admin:manageUsers',
    'hr:reviewRequests'
  ]::text[])));
create policy rbac_delete_authorized on public.employee_requests
  for delete to authenticated
  using ((select private.has_any_permission(array[
    'admin:manageUsers',
    'hr:reviewRequests'
  ]::text[])));

-- Create one INSERT/UPDATE/DELETE policy per remaining business table. Permission
-- lists intentionally combine workflows that currently upsert or replace shared
-- records. They prevent unrelated-role writes, but remain coarse table-level gates.
do $business_mutation_policies$
declare
  policy_spec record;
begin
  for policy_spec in
    select *
    from (values
      (
        'bd_submissions'::text,
        array['admin:manageUsers', 'opportunity:submitProposal', 'opportunity:assign', 'opportunity:edit', 'nonSubmission:review', 'opportunity:cancel']::text[],
        array['admin:manageUsers', 'opportunity:submitProposal', 'opportunity:assign', 'opportunity:edit', 'nonSubmission:review', 'opportunity:cancel']::text[],
        array['admin:manageUsers', 'opportunity:deleteApprove', 'opportunity:edit']::text[]
      ),
      (
        'comments'::text,
        array['admin:manageUsers', 'opportunity:create', 'opportunity:edit', 'opportunity:editSchedule', 'opportunity:comment', 'opportunity:submitProposal', 'opportunity:assign', 'opportunity:cancel', 'opportunity:deleteRequest', 'opportunity:deleteApprove', 'sourcing:write', 'nonSubmission:submit', 'nonSubmission:review', 'operations:manage', 'comment:editAny']::text[],
        array['admin:manageUsers', 'opportunity:create', 'opportunity:edit', 'opportunity:editSchedule', 'opportunity:comment', 'opportunity:submitProposal', 'opportunity:assign', 'opportunity:cancel', 'opportunity:deleteRequest', 'opportunity:deleteApprove', 'sourcing:write', 'nonSubmission:submit', 'nonSubmission:review', 'operations:manage', 'comment:editAny']::text[],
        array['admin:manageUsers', 'opportunity:create', 'opportunity:edit', 'opportunity:editSchedule', 'opportunity:comment', 'opportunity:submitProposal', 'opportunity:assign', 'opportunity:cancel', 'opportunity:deleteRequest', 'opportunity:deleteApprove', 'sourcing:write', 'nonSubmission:submit', 'nonSubmission:review', 'operations:manage', 'comment:editAny']::text[]
      ),
      (
        'contract_invoices'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[]
      ),
      (
        'contract_line_items'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[]
      ),
      (
        'contract_pocs'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[]
      ),
      (
        'contract_vehicle_orders'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[]
      ),
      (
        'contracts'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'contract:comment', 'contract:allCommChannels', 'operations:manage', 'opportunity:submitProposal', 'comment:editAny']::text[],
        array['admin:manageUsers']::text[]
      ),
      (
        'deletion_requests'::text,
        array['admin:manageUsers', 'opportunity:deleteRequest']::text[],
        array['admin:manageUsers', 'opportunity:deleteRequest', 'opportunity:deleteApprove']::text[],
        array['admin:manageUsers']::text[]
      ),
      (
        'fresh_awards'::text,
        array['admin:manageUsers', 'operations:manage', 'opportunity:submitProposal', 'opportunity:edit']::text[],
        array['admin:manageUsers', 'operations:manage', 'opportunity:submitProposal', 'opportunity:edit']::text[],
        array['admin:manageUsers', 'operations:manage']::text[]
      ),
      (
        'government_warnings'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[]
      ),
      (
        'locked_subcontractors'::text,
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[],
        array['admin:manageUsers', 'contract:edit', 'operations:manage']::text[]
      ),
      (
        'non_submission_reports'::text,
        array['admin:manageUsers', 'nonSubmission:submit', 'nonSubmission:review']::text[],
        array['admin:manageUsers', 'nonSubmission:submit', 'nonSubmission:review']::text[],
        array['admin:manageUsers', 'opportunity:edit']::text[]
      ),
      (
        'opportunities'::text,
        array['admin:manageUsers', 'opportunity:create']::text[],
        array['admin:manageUsers', 'opportunity:create', 'opportunity:edit', 'opportunity:editSchedule', 'opportunity:comment', 'opportunity:submitProposal', 'opportunity:assign', 'opportunity:cancel', 'opportunity:deleteRequest', 'opportunity:deleteApprove', 'sourcing:write', 'nonSubmission:submit', 'nonSubmission:review', 'operations:manage', 'comment:editAny']::text[],
        array['admin:manageUsers', 'opportunity:cancel', 'opportunity:deleteApprove']::text[]
      ),
      (
        'past_performances'::text,
        array['admin:manageUsers', 'pastPerformance:manage', 'operations:manage']::text[],
        array['admin:manageUsers', 'pastPerformance:manage', 'operations:manage']::text[],
        array['admin:manageUsers', 'pastPerformance:manage', 'operations:manage']::text[]
      ),
      (
        'subcontractors'::text,
        array['admin:manageUsers', 'sourcing:write']::text[],
        array['admin:manageUsers', 'sourcing:write']::text[],
        array['admin:manageUsers', 'sourcing:write']::text[]
      ),
      (
        'subk_database'::text,
        array['admin:manageUsers', 'sourcing:write']::text[],
        array['admin:manageUsers', 'sourcing:write']::text[],
        array['admin:manageUsers', 'sourcing:write']::text[]
      )
    ) as specifications(
      table_name,
      insert_permissions,
      update_permissions,
      delete_permissions
    )
  loop
    execute pg_catalog.format(
      'grant insert, update, delete on table public.%I to authenticated',
      policy_spec.table_name
    );
    execute pg_catalog.format(
      'create policy rbac_insert_authorized on public.%I for insert to authenticated with check ((select private.has_any_permission(%L::text[])))',
      policy_spec.table_name,
      policy_spec.insert_permissions::text
    );
    execute pg_catalog.format(
      'create policy rbac_update_authorized on public.%I for update to authenticated using ((select private.has_any_permission(%L::text[]))) with check ((select private.has_any_permission(%L::text[])))',
      policy_spec.table_name,
      policy_spec.update_permissions::text,
      policy_spec.update_permissions::text
    );
    execute pg_catalog.format(
      'create policy rbac_delete_authorized on public.%I for delete to authenticated using ((select private.has_any_permission(%L::text[])))',
      policy_spec.table_name,
      policy_spec.delete_permissions::text
    );
  end loop;
end;
$business_mutation_policies$;

-- Permission configuration remains readable by completed active users because the
-- client downloads it to calculate UI permissions. Only holders of the effective
-- admin:manageUsers permission may mutate role or user overrides.
alter table public.role_permission_overrides enable row level security;
alter table public.user_permission_overrides enable row level security;

drop policy if exists role_permissions_select_active on public.role_permission_overrides;
drop policy if exists role_permissions_write_admin on public.role_permission_overrides;
drop policy if exists user_permissions_select_active on public.user_permission_overrides;
drop policy if exists user_permissions_write_admin on public.user_permission_overrides;
drop policy if exists rbac_select_completed_active on public.role_permission_overrides;
drop policy if exists rbac_insert_admin on public.role_permission_overrides;
drop policy if exists rbac_update_admin on public.role_permission_overrides;
drop policy if exists rbac_delete_admin on public.role_permission_overrides;
drop policy if exists rbac_select_completed_active on public.user_permission_overrides;
drop policy if exists rbac_insert_admin on public.user_permission_overrides;
drop policy if exists rbac_update_admin on public.user_permission_overrides;
drop policy if exists rbac_delete_admin on public.user_permission_overrides;

revoke all privileges on table public.role_permission_overrides from anon;
revoke all privileges on table public.user_permission_overrides from anon;
revoke insert, update, delete on table public.role_permission_overrides from authenticated;
revoke insert, update, delete on table public.user_permission_overrides from authenticated;
grant select, insert, update, delete on table public.role_permission_overrides to authenticated;
grant select, insert, update, delete on table public.user_permission_overrides to authenticated;

create policy rbac_select_completed_active on public.role_permission_overrides
  for select to authenticated
  using ((select private.current_user_is_active()));
create policy rbac_insert_admin on public.role_permission_overrides
  for insert to authenticated
  with check ((select private.has_permission('admin:manageUsers')));
create policy rbac_update_admin on public.role_permission_overrides
  for update to authenticated
  using ((select private.has_permission('admin:manageUsers')))
  with check ((select private.has_permission('admin:manageUsers')));
create policy rbac_delete_admin on public.role_permission_overrides
  for delete to authenticated
  using ((select private.has_permission('admin:manageUsers')));

create policy rbac_select_completed_active on public.user_permission_overrides
  for select to authenticated
  using ((select private.current_user_is_active()));
create policy rbac_insert_admin on public.user_permission_overrides
  for insert to authenticated
  with check ((select private.has_permission('admin:manageUsers')));
create policy rbac_update_admin on public.user_permission_overrides
  for update to authenticated
  using ((select private.has_permission('admin:manageUsers')))
  with check ((select private.has_permission('admin:manageUsers')));
create policy rbac_delete_admin on public.user_permission_overrides
  for delete to authenticated
  using ((select private.has_permission('admin:manageUsers')));

-- Keep attachment downloads compatible for every completed active user, while
-- requiring a real application write permission for upload/upsert/delete. Storage
-- upsert needs SELECT, INSERT, and UPDATE, so all three authenticated grants remain.
--
-- This is intentionally a coarse bucket-wide gate: object paths do not encode a
-- trustworthy business record or uploader UUID, and legacy objects may not have a
-- reliable owner_id. A later migration can enforce folder/record ownership after
-- paths and metadata are normalized. Until then, a user with any listed file-write
-- permission can mutate any object in this bucket.
update storage.buckets
set public = false
where id = 'attachments';

drop policy if exists attachments_read on storage.objects;
drop policy if exists attachments_insert on storage.objects;
drop policy if exists attachments_update on storage.objects;
drop policy if exists attachments_delete on storage.objects;

revoke insert, update, delete on table storage.objects from anon;
grant select on table storage.objects to authenticated;
grant insert, update, delete on table storage.objects to authenticated;

create policy attachments_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.current_user_is_active())
  );

create policy attachments_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (select private.has_any_permission(array[
      'admin:manageUsers',
      'opportunity:create',
      'opportunity:edit',
      'opportunity:comment',
      'opportunity:submitProposal',
      'sourcing:write',
      'nonSubmission:submit',
      'contract:edit',
      'contract:comment',
      'contract:allCommChannels',
      'operations:manage',
      'pastPerformance:manage',
      'hr:manageCertifications',
      'hr:reviewRequests',
      'comment:editAny'
    ]::text[]))
  );

create policy attachments_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.has_any_permission(array[
      'admin:manageUsers',
      'opportunity:create',
      'opportunity:edit',
      'opportunity:comment',
      'opportunity:submitProposal',
      'sourcing:write',
      'nonSubmission:submit',
      'contract:edit',
      'contract:comment',
      'contract:allCommChannels',
      'operations:manage',
      'pastPerformance:manage',
      'hr:manageCertifications',
      'hr:reviewRequests',
      'comment:editAny'
    ]::text[]))
  )
  with check (
    bucket_id = 'attachments'
    and (select private.has_any_permission(array[
      'admin:manageUsers',
      'opportunity:create',
      'opportunity:edit',
      'opportunity:comment',
      'opportunity:submitProposal',
      'sourcing:write',
      'nonSubmission:submit',
      'contract:edit',
      'contract:comment',
      'contract:allCommChannels',
      'operations:manage',
      'pastPerformance:manage',
      'hr:manageCertifications',
      'hr:reviewRequests',
      'comment:editAny'
    ]::text[]))
  );

create policy attachments_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select private.has_any_permission(array[
      'admin:manageUsers',
      'opportunity:create',
      'opportunity:edit',
      'opportunity:comment',
      'opportunity:submitProposal',
      'sourcing:write',
      'nonSubmission:submit',
      'contract:edit',
      'contract:comment',
      'contract:allCommChannels',
      'operations:manage',
      'pastPerformance:manage',
      'hr:manageCertifications',
      'hr:reviewRequests',
      'comment:editAny'
    ]::text[]))
  );

-- Profiles are still managed only through the trusted user-management functions.
-- This deliberately removes every direct authenticated mutation privilege on users.
revoke all privileges on table public.users from anon;
revoke insert, update, delete on table public.users from authenticated;
drop policy if exists users_update_own_first_login on public.users;

notify pgrst, 'reload schema';

commit;
