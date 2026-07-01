-- 026_add_mfa_fields.sql
-- TOTP-based two-factor authentication.
--
-- The `mfa_enabled` column already exists on public.users (created by
-- 001_initial_schema.sql). This migration adds the two remaining columns
-- the auth flow needs:
--
--   mfa_secret          — the base32-encoded TOTP shared secret. Anyone
--                         with this string can generate valid codes for
--                         the account, so it lives in the users table
--                         alongside `password` and inherits the same
--                         permissive RLS policy. If you later tighten
--                         RLS on public.users, be sure to hide this
--                         column from anon selects.
--
--   mfa_recovery_codes  — text[] of SHA-256 hex hashes. Each element is
--                         a single-use fallback in case the authenticator
--                         device is lost. Codes are removed from the
--                         array as they are consumed. The plaintext
--                         codes are only ever shown to the user once at
--                         enrollment time and are never stored.
--
-- Until this migration is applied the app cannot enroll new users in
-- 2FA (writes to these columns fail with a "column does not exist"
-- error and the enrollment page surfaces a message).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mfa_secret         TEXT,
  ADD COLUMN IF NOT EXISTS mfa_recovery_codes TEXT[] NOT NULL DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
