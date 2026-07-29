-- Store contract-level award document metadata. File bytes remain in the
-- authenticated private attachment service; this column keeps only the
-- durable attachment identifiers, names, timestamps, and private paths.

\set ON_ERROR_STOP on

begin;

alter table public.contracts
  add column if not exists award_documents jsonb not null default '[]'::jsonb;

-- File bytes cannot participate in a PostgreSQL transaction. Queue the object
-- key in the same transaction that removes its metadata, then delete the bytes
-- only after commit. A disk failure therefore leaves a retryable orphan rather
-- than metadata that points at irreversibly missing content.
create table if not exists app_files.contract_award_deletion_queue (
  object_key uuid primary key,
  storage_path text not null check (
    length(storage_path) between 1 and 1024
    and storage_path like 'contract_awards/%'
  ),
  queued_by uuid references app_auth.accounts(id) on delete set null,
  queued_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_error_code text check (
    last_error_code is null or length(last_error_code) between 1 and 64
  )
);

create index if not exists contract_award_deletion_queue_path_idx
  on app_files.contract_award_deletion_queue (storage_path, queued_at);

revoke all on table app_files.contract_award_deletion_queue
  from public, authenticated;
grant select, delete
  on table app_files.contract_award_deletion_queue
  to app_runtime;
grant insert (object_key, storage_path, queued_by)
  on table app_files.contract_award_deletion_queue
  to app_runtime;
grant update (attempt_count, last_attempt_at, last_error_code)
  on table app_files.contract_award_deletion_queue
  to app_runtime;
revoke truncate, references, trigger
  on table app_files.contract_award_deletion_queue
  from app_runtime;

-- The API runtime deliberately has no direct service-role access to the
-- contracts table. This narrow definer function acquires the lifecycle lock
-- and checks every contract without exposing contract data or broadening the
-- runtime role. The surrounding API transaction retains the lock until file
-- metadata cleanup commits or rolls back.
create or replace function private.contract_award_file_is_referenced(
  target_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
set row_security = off
as $contract_award_reference$
begin
  lock table public.contracts in share mode;

  return exists (
    select 1
      from public.contracts contract
     where coalesce(contract.award_documents, '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object('storagePath', target_storage_path))
        or coalesce(contract.award_documents, '[]'::jsonb)
             @> jsonb_build_array(jsonb_build_object('storage_path', target_storage_path))
  );
end
$contract_award_reference$;

revoke all on function private.contract_award_file_is_referenced(text)
  from public, authenticated;
grant execute on function private.contract_award_file_is_referenced(text)
  to app_runtime;

-- Contract writes lock every referenced object before they acquire a contract
-- row/table write lock. Cleanup follows the same object-first order (object
-- FOR UPDATE, then contracts SHARE), preventing both stale-path resurrection
-- and lock-order deadlocks.
create or replace function private.lock_existing_contract_award_files(
  requested_paths text[]
)
returns text[]
language sql
security definer
set search_path = pg_catalog, app_files
set row_security = off
as $contract_award_file_lock$
  select coalesce(
    array_agg(locked.storage_path order by locked.storage_path),
    array[]::text[]
  )
    from (
      select object_file.storage_path
        from app_files.objects object_file
       where object_file.storage_path = any(
         coalesce(requested_paths, array[]::text[])
       )
       order by object_file.storage_path
       for key share
    ) locked
$contract_award_file_lock$;

revoke all on function private.lock_existing_contract_award_files(text[])
  from public;
grant execute on function private.lock_existing_contract_award_files(text[])
  to authenticated;

commit;
