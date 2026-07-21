begin;

alter table public.opportunities enable row level security;
alter table public.bd_submissions enable row level security;

-- Give each unambiguously linked tracker row a durable opportunity key. Legacy
-- duplicate/orphan rows stay NULL so this migration never guesses, merges, or
-- deletes business history. The workflow API returns a reconciliation error
-- for ambiguous groups instead of picking a winner.
alter table public.bd_submissions
  add column if not exists opportunity_id text;

do $constraint$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.bd_submissions'::regclass
       and conname = 'bd_submissions_opportunity_id_fkey'
  ) then
    alter table public.bd_submissions
      add constraint bd_submissions_opportunity_id_fkey
      foreign key (opportunity_id)
      references public.opportunities(id)
      on delete restrict
      not valid;
  end if;
end
$constraint$;

create index if not exists bd_submissions_opportunity_id_idx
  on public.bd_submissions(opportunity_id);

with opportunity_key as (
  select lower(btrim(solicitation_id)) as normalized_solicitation_id,
         min(id) as opportunity_id
    from public.opportunities
   where solicitation_id is not null
     and btrim(solicitation_id) <> ''
   group by lower(btrim(solicitation_id))
  having count(*) = 1
), tracker_key as (
  select lower(btrim(solicitation_id)) as normalized_solicitation_id
    from public.bd_submissions
   where solicitation_id is not null
     and btrim(solicitation_id) <> ''
   group by lower(btrim(solicitation_id))
  having count(*) = 1
)
update public.bd_submissions as submission
   set opportunity_id = opportunity_key.opportunity_id
  from opportunity_key
  join tracker_key using (normalized_solicitation_id)
 where lower(btrim(submission.solicitation_id)) = tracker_key.normalized_solicitation_id
   and submission.opportunity_id is null;

alter table public.bd_submissions
  validate constraint bd_submissions_opportunity_id_fkey;

create unique index if not exists bd_submissions_one_per_opportunity
  on public.bd_submissions(opportunity_id)
  where opportunity_id is not null;

-- The restored Supabase schema used broad FOR ALL policies. PostgreSQL combines
-- permissive policies with OR, so adding a restrictive DELETE policy beside
-- one of those policies would not protect anything. Replace every ALL/DELETE
-- policy on these two workflow tables, while retaining their existing native
-- API read/insert/update behavior through command-specific policies.
do $delete_policies$
declare
  policy_row record;
begin
  for policy_row in
    select table_row.relname as table_name, policy.polname as policy_name
      from pg_policy policy
      join pg_class table_row on table_row.oid = policy.polrelid
      join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
     where namespace_row.nspname = 'public'
       and (
         (table_row.relname in ('opportunities', 'bd_submissions') and policy.polcmd in ('*', 'd'))
         or table_row.relname = 'non_submission_reports'
       )
  loop
    execute format('drop policy %I on public.%I', policy_row.policy_name, policy_row.table_name);
  end loop;
end
$delete_policies$;

drop policy if exists native_authenticated_select on public.opportunities;
drop policy if exists native_authenticated_insert on public.opportunities;
drop policy if exists native_authenticated_update on public.opportunities;
create policy native_authenticated_select on public.opportunities
  for select to authenticated using (true);
create policy native_authenticated_insert on public.opportunities
  for insert to authenticated with check (true);
create policy native_authenticated_update on public.opportunities
  for update to authenticated using (true) with check (true);

-- Canceling is a lifecycle UPDATE, never a DELETE. Keep hard deletion behind
-- the explicit approval permission so a future client regression cannot erase
-- the opportunity or cascade into its related records.

create policy rbac_delete_authorized on public.opportunities
  for delete to authenticated
  using ((select private.has_any_permission(array[
    'admin:manageUsers',
    'opportunity:deleteApprove'
  ]::text[])));

drop policy if exists native_authenticated_select on public.bd_submissions;
drop policy if exists native_authenticated_insert on public.bd_submissions;
drop policy if exists native_authenticated_update on public.bd_submissions;
create policy native_authenticated_select on public.bd_submissions
  for select to authenticated using (true);
create policy native_authenticated_insert on public.bd_submissions
  for insert to authenticated with check (true);
create policy native_authenticated_update on public.bd_submissions
  for update to authenticated using (true) with check (true);

-- Tracker cleanup is destructive too and must use the same explicit approval
-- permission for hard deletion. Returning a submission to the pipeline also
-- removes only its tracker row, and the workflow API authorizes that operation
-- with opportunity:edit before entering the transaction. The generic data API
-- rejects per-row tracker DELETEs, so this additional permission cannot be used
-- to bypass the lifecycle workflow.

create policy rbac_delete_authorized on public.bd_submissions
  for delete to authenticated
  using ((select private.has_any_permission(array[
    'admin:manageUsers',
    'opportunity:deleteApprove',
    'opportunity:edit'
  ]::text[])));

drop policy if exists native_authenticated_select on public.non_submission_reports;
drop policy if exists native_authenticated_insert on public.non_submission_reports;
drop policy if exists native_authenticated_update on public.non_submission_reports;
create policy native_authenticated_select on public.non_submission_reports
  for select to authenticated using (true);
create policy native_authenticated_insert on public.non_submission_reports
  for insert to authenticated
  with check ((select private.has_any_permission(array[
    'admin:manageUsers',
    'nonSubmission:submit',
    'nonSubmission:review'
  ]::text[])));
create policy native_authenticated_update on public.non_submission_reports
  for update to authenticated
  using ((select private.has_any_permission(array[
    'admin:manageUsers',
    'nonSubmission:submit',
    'nonSubmission:review'
  ]::text[])))
  with check ((select private.has_any_permission(array[
    'admin:manageUsers',
    'nonSubmission:submit',
    'nonSubmission:review'
  ]::text[])));

-- Late proposal submission removes a still-pending report in the same API
-- transaction as the opportunity/tracker transition. The generic endpoint
-- blocks per-row report deletes, so these permissions are usable only through
-- the checked workflow route.
create policy rbac_delete_authorized on public.non_submission_reports
  for delete to authenticated
  using ((select private.has_any_permission(array[
    'admin:manageUsers',
    'opportunity:edit',
    'opportunity:submitProposal',
    'opportunity:cancel',
    'nonSubmission:review'
  ]::text[])));

commit;
