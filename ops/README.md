# Native CE CRM backend

This directory contains the Docker-free host pieces for the custom API and
PostgreSQL 17 replacement. The application migration itself lives under
`server/migrations`.

## Safety model

The cutover is deliberately two-stage:

1. Prepare PostgreSQL 17 on `127.0.0.1:5433` while the old database remains on
   `127.0.0.1:5432`.
2. Apply `server/migrations/001_prepare_native_api.sql` additively to the old
   database and verify the custom API against a copied database.
3. Freeze writes, take a final encrypted backup, apply
   `002_detach_supabase_auth.sql`, and copy only the application schemas to the
   native cluster.
4. Validate row counts, constraints, indexes, sequences, credential hashes,
   API behavior, and backups before exposing the new frontend.
5. Stop the former stack without deleting its data. Keep it immutable for the
   rollback window.

Never route both databases for writes at the same time. Once native writes are
accepted, rolling back requires freezing writes and reconciling the outbox;
simply pointing at the old database would discard newer changes.

## Host bootstrap

`bootstrap-native-host.sh` installs the official PGDG PostgreSQL 17 packages
and a checksum-verified Node.js 24 LTS release. It creates the `17/cecrm`
cluster on port 5433, enables page checksums, binds PostgreSQL to localhost,
and creates private service/storage directories. It does not stop, restart, or
edit the existing containers. `prepare-native-caddy.sh` is a separate,
non-disruptive step because the current Docker proxy must keep ports 80 and 443
until the final switch.

Run from a root shell on Ubuntu 24.04:

```bash
bash ops/bootstrap-native-host.sh
```

## Stage host-native Caddy

Run this while the existing `supabase-caddy` container is still serving
production:

```bash
bash ops/prepare-native-caddy.sh
```

The script copies the reviewed Caddy 2.11.4 binary from the running container,
compares its SHA-256 digest before and after the copy, verifies the pinned
version, creates the unprivileged `caddy` account and private data directories,
installs the Caddyfile and systemd unit, and validates the configuration. It
leaves `caddy-cecrm.service` disabled and checks that the source container is
still running. If the source container has a different reviewed name or binary
path, set `CADDY_SOURCE_CONTAINER` or `CADDY_SOURCE_BINARY`; a version change
also requires an intentional `CADDY_EXPECTED_VERSION` override.

The script refuses to overwrite a different host binary, Caddyfile, or unit.
Resolve such a conflict manually rather than deleting an unknown installation.
It never stops either proxy. During the final write freeze, start the API and
verify it locally, stop the old Docker ingress, confirm ports 80 and 443 are
free, and only then enable/start `caddy-cecrm.service`.

The API unit expects compiled server code in `/opt/ce-crm/app/server`, a
root-owned `/etc/ce-crm/api.env` readable by group `cecrm`, and attachment data
under `/var/lib/ce-crm/attachments`.

## Required server environment

The real file must be mode `0640`, owned by `root:cecrm`, and must never be
committed. At minimum it contains:

```env
DATABASE_URL=postgresql://app_runtime:generated-password@127.0.0.1:5433/ce_crm
HOST=127.0.0.1
PORT=3001
TRUST_PROXY=true
ALLOWED_ORIGINS=https://crm.cesolutionplus.com,https://www.crm.cesolutionplus.com,https://abk541.github.io
ATTACHMENTS_DIR=/var/lib/ce-crm/attachments
SAM_GOV_API_KEY=server-only-value
```

The browser receives only `VITE_API_URL`. No database password, session token,
or SAM.gov key belongs in a Vite environment variable.

## Encrypted backups

The quickest safe installation is:

```bash
bash ops/install-native-backup.sh
systemctl start ce-crm-backup.service
```

The installer generates `/etc/ce-crm/backup.agekey` without printing it,
creates the private environment file, installs the job, and enables the daily
timer. Copy that identity file to a secure off-VPS location immediately.

Install `ce-crm-backup.sh` as `/usr/local/sbin/ce-crm-backup`, install the
matching service/timer units, and create `/etc/ce-crm/backup.env` as a
root-owned mode-`0600` file:

```bash
install -o root -g root -m 0750 ops/ce-crm-backup.sh /usr/local/sbin/ce-crm-backup
install -o root -g root -m 0644 \
  ops/systemd/ce-crm-backup.service \
  ops/systemd/ce-crm-backup.timer \
  /etc/systemd/system/
```

```env
AGE_RECIPIENT=age1-reviewed-public-recipient
AGE_IDENTITY_FILE=/etc/ce-crm/backup.agekey
RETENTION_DAYS=14
```

The identity file must also be root-owned and mode `0600`. Each run creates the
PostgreSQL dump as the `postgres` OS account without granting that account
access to the root-only staging directory. Before publishing the encrypted
archive, the script decrypts it, requires exactly the database dump, attachment
archive, and checksum manifest, validates both inner hashes, and parses both
archive formats. This is an integrity gate, not a restore test: perform an
actual disposable-database restore before cutover and periodically thereafter.
After the environment and identity files are in place, run one backup manually
before enabling the schedule:

```bash
systemctl daemon-reload
systemctl start ce-crm-backup.service
systemctl status --no-pager ce-crm-backup.service
systemctl enable --now ce-crm-backup.timer
```

Test a specific archive with a real disposable restore:

```bash
bash ops/test-native-backup-restore.sh \
  /var/backups/ce-crm/ce-crm-YYYYMMDDTHHMMSSZ.tar.age
```

Keep at least one verified encrypted archive, its `.sha256` file, and the age
identity in separate off-VPS locations. The database dump and attachment tar
are individually consistent, but they are not one atomic cross-resource
snapshot while uploads are active; take the final migration backup only after
the write freeze (or use a filesystem snapshot for routine point consistency).

## Verification gates

Before enabling native writes, confirm all of the following:

- All 24 public-table counts match the frozen source.
- All 16 profiles have one matching `app_auth.accounts` row and the copied
  bcrypt hashes are byte-for-byte equal to the source snapshot.
- Every primary key, foreign key, unique/check constraint, and index is valid.
- `bd_submissions_id_seq` is not behind `max(bd_submissions.id)`.
- `app_runtime` is not a superuser, owner, or `BYPASSRLS` role.
- PostgreSQL listens only on `127.0.0.1:5433` and the API only on localhost.
- Login, first-login password rotation, session restore/logout, CRUD, RBAC,
  admin-user safety, SAM import, file upload/download, SSE, and polling pass.
- A newly created encrypted backup can be restored into a disposable database.
- The final encrypted backup and checksum exist in a verified off-VPS copy.
- Built frontend assets contain the API URL and no Supabase API, Auth, Storage,
  Realtime, Function, database credential, or SAM-key material.

## Rollback

Before native writes are opened, rollback is routing the browser to the old
frontend/API. After native writes are opened, first enter maintenance mode,
export/reconcile all custom-API outbox changes, and only then restore the old
route. Retain the old database volume and final encrypted backup for at least
7–14 days; do not delete them during the initial cutover.
