-- Persist the Contract Opportunities activation rule as one workspace-wide,
-- browser-safe setting. Existing workspaces keep the legacy "Associate
-- required" behavior until an administrator changes it.

begin;

alter table public.app_settings
  drop constraint if exists app_settings_known_non_secret_key;

alter table public.app_settings
  add constraint app_settings_known_non_secret_key
  check (key in (
    'non_sub_grace_hours',
    'non_sub_grace_minutes',
    'require_associate_for_active_pipeline'
  ));

insert into public.app_settings (key, value)
values ('require_associate_for_active_pipeline', 'true')
on conflict (key) do nothing;

commit;
