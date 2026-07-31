-- Account-scoped popup delivery receipts.
--
-- Notification rows remain unread until the user marks them read. This table
-- leases personal popups until the browser acknowledges that it displayed
-- them. An interrupted request can therefore retry without replaying a popup
-- that was already acknowledged on another device.

\set ON_ERROR_STOP on

begin;

create table if not exists app_auth.notification_popup_deliveries (
  notification_id text not null
    references public.notifications(id)
    on delete cascade,
  account_id uuid not null
    references app_auth.accounts(id)
    on delete cascade,
  claimed_at timestamptz not null default pg_catalog.now(),
  delivered_at timestamptz,
  primary key (notification_id, account_id)
);

create index if not exists notification_popup_deliveries_account_recent_idx
  on app_auth.notification_popup_deliveries (account_id, delivered_at, claimed_at desc);

-- Existing personal notifications predate popup claims and must remain normal
-- history. Baseline only rows that can be tied to one authenticated account;
-- future rows are claimed atomically by the API when that account returns.
insert into app_auth.notification_popup_deliveries (
  notification_id, account_id, claimed_at, delivered_at
)
select notification.id,
       profile.auth_user_id,
       coalesce(notification.created_at, pg_catalog.now()),
       coalesce(notification.created_at, pg_catalog.now())
  from public.notifications notification
  join public.users profile
    on profile.id = notification.target_user_id
 where profile.auth_user_id is not null
on conflict (notification_id, account_id) do nothing;

alter table app_auth.notification_popup_deliveries enable row level security;

revoke all on table app_auth.notification_popup_deliveries
  from public, authenticated, app_runtime;
grant select, insert, update on table app_auth.notification_popup_deliveries
  to authenticated;

drop policy if exists notification_popup_deliveries_select_own
  on app_auth.notification_popup_deliveries;
create policy notification_popup_deliveries_select_own
  on app_auth.notification_popup_deliveries
  for select
  to authenticated
  using (account_id = app_auth.request_account_id());

drop policy if exists notification_popup_deliveries_insert_own
  on app_auth.notification_popup_deliveries;
create policy notification_popup_deliveries_insert_own
  on app_auth.notification_popup_deliveries
  for insert
  to authenticated
  with check (account_id = app_auth.request_account_id());

drop policy if exists notification_popup_deliveries_update_own
  on app_auth.notification_popup_deliveries;
create policy notification_popup_deliveries_update_own
  on app_auth.notification_popup_deliveries
  for update
  to authenticated
  using (account_id = app_auth.request_account_id())
  with check (account_id = app_auth.request_account_id());

commit;
