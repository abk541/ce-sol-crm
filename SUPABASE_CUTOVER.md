# Self-hosted Supabase cutover

The production CRM uses the self-hosted Supabase stack at:

`https://vmi3454103.contaboserver.net`

The stack is installed at `/opt/supabase` on the Contabo VPS. PostgreSQL and
Supavisor listen only on localhost; public traffic reaches the stack through
Caddy and Envoy over HTTPS.

## Application configuration

The frontend requires these build-time variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

They are configured as GitHub Actions secrets for the repository and the
`github-pages` environment. The SAM.gov API key is intentionally not a
frontend variable. It is stored only on the VPS as `SAM_GOV_API_KEY` in
`/opt/supabase/.env.functions` and is consumed by the `sam-gov-import` Edge
Function.

The permitted browser origins are:

- `https://crm.cesolutionplus.com`
- `https://abk541.github.io`
- `http://localhost:5173`

## Authentication and authorization

All application users are backed by Supabase Auth. A corresponding
`public.users` row, linked through `auth_user_id`, is required for application
access.

New and migrated users have `first_login = true`. They can read only their own
safe profile until they replace their password through the `manage-users`
Edge Function. Inactive users and users whose setup is incomplete receive no
business data.

Business-table mutations are enforced by PostgreSQL RLS using the effective
permission set derived from the user's role, role overrides, user revocations,
and user grants. The final effective administrator cannot be removed after the
administrator invariant has latched.

The `attachments` Storage bucket is private. The browser must use authenticated
Storage downloads; public object URLs are not supported.

## Forward migrations

The destination was restored from a complete source database dump. Do not run
`supabase db push` against it and do not blindly replay the 37 historical SQL
files. Some historical versions collide and one migration intentionally clears
business data.

Only apply new, reviewed, forward-only migrations. The cutover migrations are:

- `20260720180931_prepare_auth_user_mapping.sql`
- `20260720181530_secure_supabase_auth_cutover.sql`
- `20260720183000_harden_postgres_default_privileges.sql`
- `20260720190000_enforce_first_login_gate.sql`
- `20260720191000_secure_sam_and_private_attachments.sql`
- `20260720192000_enforce_coarse_permission_rbac.sql`

## Edge Function deployment

The deployed sources live under `/opt/supabase/volumes/functions`. After
updating `manage-users` or `sam-gov-import`, recreate the Functions container
with every production Compose override:

```sh
cd /opt/supabase
sudo docker compose \
  -f docker-compose.yml \
  -f docker-compose.envoy.yml \
  -f docker-compose.caddy-envoy.yml \
  -f docker-compose.local.yml \
  -f docker-compose.manage-users.yml \
  up -d --no-deps --force-recreate functions
```

Never place `SUPABASE_SERVICE_ROLE_KEY` or `SAM_GOV_API_KEY` in client code,
GitHub Pages output, logs, or browser-visible settings.

## Backups

An encrypted backup runs daily and retains 14 days. Create one on demand with:

```sh
sudo /usr/local/sbin/supabase-backup
```

Backups are written to `/opt/supabase/backups`. Each archive contains the
PostgreSQL dump and globals, the pgsodium root key, Storage volume, function
sources, and production configuration. Archives are encrypted to the dedicated
migration SSH public key; keep the matching private key offline and protected.

## Known incomplete source artifact

The source Supabase project reports 73 Storage objects totaling about 219 MiB,
but its billing lock returns HTTP 402 for every tested download path. Their
metadata and exact object keys are preserved in the migration export, but their
file bytes are not present on the destination. Retry recovery before closing
the source project if Supabase restores Storage access.

The original export and partial ZIP contain legacy password-related columns
from before the Auth cutover. Treat them as sensitive recovery material and
encrypt or delete them after the retention decision is made.
