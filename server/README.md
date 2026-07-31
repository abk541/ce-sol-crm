# CE Solution CRM API

This service replaces Supabase Auth, PostgREST, Storage, Realtime, and Edge
Functions with one private PostgreSQL-backed Fastify API. PostgreSQL must not be
published to the Internet; only the HTTPS reverse proxy may reach the API.

## Runtime

- Node.js 20 or newer
- PostgreSQL 17
- A private writable attachment directory
- An exact browser-origin allowlist

Copy `env.example` to a root-owned deployment environment file, replace every
placeholder, and grant the unprivileged service account read access to that
file. Never place `DATABASE_URL` or `SAM_GOV_API_KEY` in a Vite variable.

## Database preparation and cutover

Take and verify a fresh encrypted database backup before applying migrations.

1. Apply `migrations/001_prepare_native_api.sql` as the database owner. It
   transactionally copies existing GoTrue bcrypt credentials, adds opaque
   sessions/files/outbox state, preserves legacy Storage metadata, introduces a
   neutral request-account helper, and keeps the old `auth.users` FK for the
   preparation/rollback window.
2. Confirm every profile has one `app_auth.accounts` row and run API tests
   against a restored/staging database.
3. Generate a strong database password outside SQL, then enable the prepared
   role: `ALTER ROLE app_runtime LOGIN PASSWORD '<generated-secret>';`. Store it
   only in the root-owned environment file.
4. Apply `migrations/002_detach_supabase_auth.sql` during the final write freeze.
   It drops only the old `auth.users` FK after a fail-closed mapping check. It
   deliberately does not delete the old schemas or data.
5. On an already-cut-over native deployment, apply
   `migrations/004_preserve_canceled_opportunities.sql` as the database owner.
   It prevents cancellation from being treated as deletion, links only
   unambiguous BD Tracker rows to opportunities, and leaves duplicate/orphan
   history untouched for manual review.
6. Apply `migrations/005_notification_read_receipts.sql` as the database owner.
   It stores notification read state per account instead of changing the shared
   notification row for every user.
7. Apply `migrations/006_pipeline_activation_setting.sql` as the database owner.
   It allowlists and seeds the workspace-wide Contract Opportunities activation
   rule without overwriting an administrator's existing choice.
8. Apply `migrations/007_contract_award_documents.sql` as the database owner.
   It adds durable metadata for named award documents uploaded from Contract
   Admin, the narrow all-contract reference guard, and a private deletion queue.
   Metadata and its cleanup job commit before file bytes are touched, so disk
   failures remain safely retryable. Contract writes also lock and validate
   every award-file path first, preventing stale screens from restoring a file
   that cleanup has already detached.
9. Apply `migrations/008_private_integration_secrets.sql` as the database owner.
   It moves any legacy SAM.gov key out of public settings and grants only the
   native API service access to the private credential store.
10. Apply `migrations/009_native_mfa.sql` as the database owner. It adds
    private encrypted authenticator factors, hashed one-time recovery codes,
    short-lived sign-in challenges, session assurance, audit events, and the
    least-privilege runtime grants. Do not add these tables to the earlier
    native baseline scripts: migration 009 owns their creation and ACL.
11. Apply `migrations/010_notification_popup_deliveries.sql` as the database
    owner. It adds private, account-scoped popup leases so personal workflow
    alerts created while a user is signed out are displayed once after login
    and safely retried if the browser closes before acknowledging them.
11. Start the API, verify `/health/ready`, and exercise login, first-login, CRUD,
   role denial, user administration, SAM status/import, file upload/download,
   atomic submit/cancel/restore, assignment repair, and SSE before enabling
   production writes.

The SQL is idempotent. Migration 001 never overwrites a password already changed
through this service.

## Mandatory 2FA rollout

Generate `MFA_ENCRYPTION_KEY` once as documented in `env.example`, keep it
stable and root-owned, and back it up separately from PostgreSQL. An accidental
rotation makes existing authenticator factors unreadable.

Use this order so old browser bundles are never locked out:

1. Back up and apply migration 009.
2. Deploy the API with `MFA_ENFORCEMENT_ENABLED=false`.
3. Deploy the compatible frontend and verify password, first-login, enrollment,
   recovery-code, restore, logout, and administrator-reset flows.
4. Set `MFA_ENFORCEMENT_ENABLED=true`, restart the API, and verify readiness.
   Startup revokes every legacy-assurance session; all active users must enroll
   again once.

Only the literal `true` enables enforcement. Invalid flag values stop startup.
The API is the single authority for this switch: older browser bundles may
still send their historical `mfaSupported` capability field, but it cannot
enable MFA while server enforcement is off. Disabling enforcement preserves
all enrolled authenticator factors and recovery codes for a later reactivation.
Pending sign-in challenges are rejected while enforcement is off and consumed
when enforcement starts again, so a pre-disable challenge cannot revive.
The setup script preserves an existing valid key and enforcement flag; it
refuses duplicate or malformed installed values rather than silently rotating
or disabling them.

## Commands

```sh
npm ci
npm test
npm run build
npm start
```

## Browser contract

Every protected request sends `Authorization: Bearer <opaque-token>`. The raw
token is returned only by login and a successful first-login rotation; only its
SHA-256 hash is stored in PostgreSQL. Sessions expire absolutely after 24 hours
by default and are revoked immediately on password reset or account disable.

Routes:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/first-login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/data/query|insert|upsert|update|delete`
- `POST /api/v1/opportunity-workflows`
- `POST /api/v1/deletion-reviews`
- `GET /api/v1/notifications/read-state`
- `POST /api/v1/notifications/read`
- `POST /api/v1/notifications/popup-claims`
- `POST /api/v1/notifications/popup-ack`
- `POST /api/v1/admin/users/actions`
- `GET /api/v1/integrations/sam/status`
- `POST /api/v1/integrations/sam/settings`
- `POST /api/v1/integrations/sam/import`
- `POST /api/v1/files`
- `GET /api/v1/files/:encodedPath` (also `GET /api/v1/files?path=...`)
- `DELETE /api/v1/files/contract-awards/:encodedPath` (contract editors/admins
  only; refuses to remove files still referenced by any contract)
- `POST /api/v1/files/contract-awards/cleanup/retry` (contract editors/admins
  only; retries at most 25 safely detached file-cleanup jobs)
- `GET /api/v1/events`
- `GET /health/live` and `GET /health/ready`

The data endpoints accept only the fixed public-table allowlist and structured,
column-validated filters. They never accept SQL fragments. `filters` are ANDed;
each `orGroups` item is an OR group. Supported operators are `eq`, `neq`,
`ilike`, `is`, `not.is`, and `in`. Existing database RLS and effective role/user
permission overrides remain authoritative because each request runs in a short
transaction with its account UUID set locally.

Submit, cancel, restore, and tracker-repair actions use the opportunity-workflow
route. It locks and updates both records in one transaction, rejects stale or
ambiguous legacy state, and never deletes an opportunity during cancellation.

Uploads are multipart requests with one `file` plus optional `folder`, `id`, and
`attachedAt` fields. Physical filenames are server-generated UUIDs, never user
input. Historical metadata whose bytes could not be recovered returns HTTP 410
with `file_content_unavailable` rather than an empty file.

SSE uses a single PostgreSQL `LISTEN` connection shared by all browser clients,
and clients resume with `Last-Event-ID`. Use a streaming `fetch` so the bearer
header remains out of URLs and proxy logs; polling remains a valid fallback.
