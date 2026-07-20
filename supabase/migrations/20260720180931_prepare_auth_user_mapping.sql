-- Phase 1: add the nullable Auth/profile mapping used by the one-time GoTrue
-- import. Do not apply the secure cutover migration until every profile has
-- been mapped. This migration intentionally preserves all legacy credential
-- columns so the import can be validated before the irreversible cutover.

begin;

alter table public.users
  add column if not exists auth_user_id uuid;

-- Enforce one profile per Auth identity during the import while still allowing
-- unmapped rows. Phase 2 replaces this partial index with a NOT NULL unique
-- constraint and an auth.users FK after its fail-closed preflight succeeds.
create unique index if not exists users_auth_user_id_bootstrap_unique_idx
  on public.users (auth_user_id)
  where auth_user_id is not null;

comment on column public.users.auth_user_id is
  'Supabase Auth identity. Nullable only during the one-time Auth import; phase 2 enforces NOT NULL/FK/unique.';

notify pgrst, 'reload schema';

commit;
