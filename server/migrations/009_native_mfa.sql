-- Native, server-enforced authenticator-app MFA.
--
-- Apply as the database owner before deploying the MFA-capable API. The
-- browser never receives access to these tables. Existing sessions remain
-- marked "legacy" so the API can invalidate them atomically when
-- MFA_ENFORCEMENT_ENABLED is switched on after the compatible frontend ships.

\set ON_ERROR_STOP on

begin;

alter table app_auth.sessions
  add column if not exists assurance_level text;
alter table app_auth.sessions
  add column if not exists mfa_verified_at timestamptz;

update app_auth.sessions
   set assurance_level = 'legacy'
 where assurance_level is null;

alter table app_auth.sessions
  alter column assurance_level set default 'legacy';
alter table app_auth.sessions
  alter column assurance_level set not null;

do $constraints$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'sessions_assurance_level_check'
       and conrelid = 'app_auth.sessions'::regclass
  ) then
    alter table app_auth.sessions
      add constraint sessions_assurance_level_check
      check (assurance_level in ('legacy', 'mfa'));
  end if;

  if not exists (
    select 1
      from pg_constraint
     where conname = 'sessions_mfa_assurance_check'
       and conrelid = 'app_auth.sessions'::regclass
  ) then
    alter table app_auth.sessions
      add constraint sessions_mfa_assurance_check
      check (assurance_level <> 'mfa' or mfa_verified_at is not null);
  end if;
end
$constraints$;

create table if not exists app_auth.mfa_factors (
  id uuid primary key,
  account_id uuid not null unique references app_auth.accounts(id) on delete cascade,
  encrypted_secret bytea not null,
  secret_iv bytea not null check (octet_length(secret_iv) = 12),
  secret_auth_tag bytea not null check (octet_length(secret_auth_tag) = 16),
  key_version smallint not null default 1 check (key_version > 0),
  enabled_at timestamptz,
  last_used_timestep bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_auth.mfa_challenges (
  id uuid primary key,
  account_id uuid not null references app_auth.accounts(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  password_version integer not null check (password_version > 0),
  stage text not null check (
    stage in ('first_login', 'mfa_enroll', 'mfa_verify', 'mfa_recovery')
  ),
  attempts_remaining smallint not null check (attempts_remaining between 0 and 10),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  user_agent text,
  remote_address inet,
  pending_secret bytea,
  pending_secret_iv bytea,
  pending_secret_auth_tag bytea,
  pending_secret_key_version smallint,
  pending_factor_id uuid references app_auth.mfa_factors(id) on delete set null,
  pending_recovery_codes bytea,
  pending_recovery_iv bytea,
  pending_recovery_auth_tag bytea,
  pending_recovery_key_version smallint,
  check (expires_at > created_at),
  check (
    (pending_secret is null and pending_secret_iv is null
      and pending_secret_auth_tag is null and pending_secret_key_version is null)
    or
    (pending_secret is not null
      and pending_secret_iv is not null
      and pending_secret_auth_tag is not null
      and pending_secret_key_version is not null
      and octet_length(pending_secret_iv) = 12
      and octet_length(pending_secret_auth_tag) = 16
      and pending_secret_key_version > 0)
  ),
  check (
    (pending_recovery_codes is null and pending_recovery_iv is null
      and pending_recovery_auth_tag is null and pending_recovery_key_version is null)
    or
    (pending_recovery_codes is not null
      and pending_recovery_iv is not null
      and pending_recovery_auth_tag is not null
      and pending_recovery_key_version is not null
      and octet_length(pending_recovery_iv) = 12
      and octet_length(pending_recovery_auth_tag) = 16
      and pending_recovery_key_version > 0)
  )
);

create table if not exists app_auth.mfa_recovery_codes (
  id uuid primary key,
  factor_id uuid not null references app_auth.mfa_factors(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  unique (factor_id, code_hash)
);

create table if not exists app_auth.mfa_audit_events (
  id uuid primary key,
  actor_account_id uuid,
  target_account_id uuid not null,
  action text not null check (
    action in ('admin_reset', 'enrollment_completed', 'recovery_code_used')
  ),
  created_at timestamptz not null default now(),
  remote_address inet,
  user_agent text
);

create index if not exists mfa_challenges_account_active_idx
  on app_auth.mfa_challenges (account_id, expires_at)
  where consumed_at is null;
create index if not exists mfa_challenges_expiry_idx
  on app_auth.mfa_challenges (expires_at)
  where consumed_at is null;
create index if not exists mfa_recovery_codes_factor_unused_idx
  on app_auth.mfa_recovery_codes (factor_id)
  where used_at is null;
create index if not exists mfa_audit_target_created_idx
  on app_auth.mfa_audit_events (target_account_id, created_at desc);

-- The private factor table, rather than the old public flag, is authoritative.
-- This resets every legacy account exactly once while preserving users who
-- have enrolled if the idempotent migration is run again.
update public.users profile
   set mfa_enabled = false
 where not exists (
   select 1
     from app_auth.mfa_factors factor
    where factor.account_id = profile.auth_user_id
      and factor.enabled_at is not null
 );

revoke all on app_auth.mfa_factors,
  app_auth.mfa_challenges,
  app_auth.mfa_recovery_codes,
  app_auth.mfa_audit_events
  from public, authenticated, app_runtime;

grant select, insert, update, delete
  on app_auth.mfa_factors,
     app_auth.mfa_challenges,
     app_auth.mfa_recovery_codes
  to app_runtime;
grant select, insert on app_auth.mfa_audit_events to app_runtime;

revoke truncate, references, trigger
  on app_auth.mfa_factors,
     app_auth.mfa_challenges,
     app_auth.mfa_recovery_codes,
     app_auth.mfa_audit_events
  from app_runtime;

commit;
