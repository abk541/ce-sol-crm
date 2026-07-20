# Native PostgreSQL cutover

The production CRM no longer uses Supabase at runtime. Its browser API is:

`https://vmi3454103.contaboserver.net/api/v1`

The Docker-free production services are:

- PostgreSQL 17 cluster `17/cecrm` on `127.0.0.1:5433`
- the unprivileged `ce-crm-api.service` on `127.0.0.1:3001`
- the host-native `caddy-cecrm.service` on public ports 80/443
- the daily encrypted `ce-crm-backup.timer`

The frontend receives only `VITE_API_URL`. Database credentials and the
SAM.gov key are stored in `/etc/ce-crm/api.env`, owned by `root:cecrm` with
mode `0640`. PostgreSQL and the Node API must never be exposed directly to the
Internet.

Operational scripts, restore order, validation gates, backup instructions,
and rollback guidance are documented in `ops/README.md`. API routes and the
browser contract are documented in `server/README.md`.

The retired stack under `/opt/supabase` is retained only as immutable rollback
evidence during the initial retention window. Do not restart it for production
writes and do not delete its volumes until the native service and backups have
been observed for at least 7–14 days.

## Historical attachment limitation

The source project reported 73 historical Storage objects, but its billing
lock returned HTTP 402 for every tested download path. Their export metadata is
retained in the migration materials, but those file bytes could not be
recovered. The live source Storage database contained no downloadable object
rows at final cutover. New uploads use the native private attachment store.
