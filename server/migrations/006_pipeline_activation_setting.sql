-- Persist the Contract Opportunities activation rule as one workspace-wide,
-- browser-safe setting. Existing workspaces keep the legacy "Associate
-- required" behavior until an administrator changes it.

\set ON_ERROR_STOP on

begin;

alter table public.app_settings
  drop constraint if exists app_settings_known_non_secret_key;

alter table public.app_settings
  add constraint app_settings_known_non_secret_key
  check (key in (
    'non_sub_grace_hours',
    'non_sub_grace_minutes',
    'require_associate_for_active_pipeline'
  )) not valid;

-- Migration 008 removes and privately preserves a legacy SAM.gov credential
-- before validating this allowlist. PostgreSQL still enforces a NOT VALID
-- constraint for every new or changed row, while permitting that pre-existing
-- legacy row to survive long enough to be migrated without data loss.

insert into public.app_settings (key, value)
values ('require_associate_for_active_pipeline', 'true')
on conflict (key) do nothing;

commit;
