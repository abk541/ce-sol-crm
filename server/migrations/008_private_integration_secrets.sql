\set ON_ERROR_STOP on

begin;

create table if not exists private.integration_secrets (
  name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references app_auth.accounts(id) on delete set null,
  constraint integration_secrets_name_not_blank check (btrim(name) <> ''),
  constraint integration_secrets_value_not_blank check (btrim(secret_value) <> '')
);

create index if not exists integration_secrets_updated_by_idx
  on private.integration_secrets (updated_by)
  where updated_by is not null;

comment on table private.integration_secrets is
  'Server-only integration credentials. Values must never be projected through browser data routes.';
comment on column private.integration_secrets.secret_value is
  'Sensitive server credential. API responses expose configuration status only.';

-- The native cluster has no legacy Supabase `anon` role. PUBLIC covers every
-- role by default, while authenticated is revoked explicitly for clarity.
revoke all on private.integration_secrets from public, authenticated;
grant select, insert, update, delete on private.integration_secrets to app_runtime;
revoke truncate, references, trigger on private.integration_secrets from app_runtime;

-- Preserve a key saved by the retired Supabase Admin UI, then remove every
-- copy (including an empty seed row) from the browser-readable public table.
do $migration$
begin
  if to_regclass('public.app_settings') is not null then
    insert into private.integration_secrets (name, secret_value)
    select 'sam_gov_api_key', btrim(value)
      from public.app_settings
     where key = 'sam_gov_api_key'
       and btrim(coalesce(value, '')) <> ''
    on conflict (name) do nothing;

    delete from public.app_settings where key = 'sam_gov_api_key';
  end if;

  -- app_settings changes are journaled for realtime delivery. Remove every
  -- historical and migration-generated event containing this credential so
  -- the key is not retained in the outbox or exposed to the API runtime.
  if to_regclass('app_events.outbox') is not null then
    delete from app_events.outbox
     where topic = 'app_settings.changed'
       and (
         old_row ->> 'key' = 'sam_gov_api_key'
         or new_row ->> 'key' = 'sam_gov_api_key'
       );
  end if;
end
$migration$;

-- Migration 006 deliberately left this constraint NOT VALID so a pre-existing
-- SAM.gov key could survive until it was copied above. Recreate it as a fully
-- validated allowlist now that the public secret and its outbox history are gone.
alter table public.app_settings
  drop constraint if exists app_settings_known_non_secret_key;

alter table public.app_settings
  add constraint app_settings_known_non_secret_key
  check (key in (
    'non_sub_grace_hours',
    'non_sub_grace_minutes',
    'require_associate_for_active_pipeline'
  ));

commit;
