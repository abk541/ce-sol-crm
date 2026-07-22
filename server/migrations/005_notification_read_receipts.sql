-- Per-account notification read receipts for the native PostgreSQL API.
--
-- The legacy public.notifications.read flag is shared by the whole workspace:
-- updating it for one user also marks the alert read for every other user who
-- can see that row. Receipts live in the private auth schema and are always
-- bound to app_auth.request_account_id(), so one browser session cannot read or
-- write another account's state.

\set ON_ERROR_STOP on

begin;

create table if not exists app_auth.notification_reads (
  notification_id text not null
    references public.notifications(id)
    on delete cascade,
  account_id uuid not null
    references app_auth.accounts(id)
    on delete cascade,
  read_at timestamptz not null default pg_catalog.now(),
  primary key (notification_id, account_id)
);

create index if not exists notification_reads_account_recent_idx
  on app_auth.notification_reads (account_id, read_at desc);

-- Preserve the old shared-read meaning during the one-way transition: a row
-- marked read in the shared table was read for every account. Materialize that
-- state as one private receipt per existing account before clearing the legacy
-- flag. Both operations remain inside this migration transaction.
insert into app_auth.notification_reads (notification_id, account_id, read_at)
select notification.id, account.id, pg_catalog.now()
  from public.notifications notification
  cross join app_auth.accounts account
 where notification.read is true
on conflict (notification_id, account_id) do nothing;

update public.notifications
   set read = false
 where read is true;

alter table app_auth.notification_reads enable row level security;

-- The native cluster intentionally has no legacy Supabase `anon` role.
-- Revoking PUBLIC removes default access for every unlisted role.
revoke all on table app_auth.notification_reads
  from public, authenticated, app_runtime;
grant select, insert, update on table app_auth.notification_reads
  to authenticated;

drop policy if exists notification_reads_select_own
  on app_auth.notification_reads;
create policy notification_reads_select_own
  on app_auth.notification_reads
  for select
  to authenticated
  using (account_id = app_auth.request_account_id());

drop policy if exists notification_reads_insert_own
  on app_auth.notification_reads;
create policy notification_reads_insert_own
  on app_auth.notification_reads
  for insert
  to authenticated
  with check (account_id = app_auth.request_account_id());

drop policy if exists notification_reads_update_own
  on app_auth.notification_reads;
create policy notification_reads_update_own
  on app_auth.notification_reads
  for update
  to authenticated
  using (account_id = app_auth.request_account_id())
  with check (account_id = app_auth.request_account_id());

commit;
