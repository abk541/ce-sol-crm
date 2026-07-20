#!/usr/bin/env bash
set -Eeuo pipefail

# Prepare the VPS for the CE CRM native stack without changing or stopping the
# existing Supabase containers. Run as root on Ubuntu 24.04.

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

NODE_VERSION="24.18.0"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_PREFIX="/opt/node-v${NODE_VERSION}"
PG_CLUSTER="cecrm"
PG_PORT="5433"

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release postgresql-common xz-utils age

# PostgreSQL's official PGDG repository is required because Ubuntu 24.04's
# standard repository provides PostgreSQL 16 while the source is PostgreSQL 17.
install -d -m 0755 /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  | gpg --dearmor --yes -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
. /etc/os-release
printf 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt.postgresql.org/pub/repos/apt %s-pgdg main\n' \
  "${VERSION_CODENAME}" > /etc/apt/sources.list.d/pgdg.list

# Do not let package installation create a port-5432 cluster. The existing
# production pooler owns 127.0.0.1:5432 until the verified cutover.
if [[ -f /etc/postgresql-common/createcluster.conf ]]; then
  if grep -q '^create_main_cluster' /etc/postgresql-common/createcluster.conf; then
    sed -i 's/^create_main_cluster.*/create_main_cluster = false/' \
      /etc/postgresql-common/createcluster.conf
  else
    printf '\ncreate_main_cluster = false\n' >> /etc/postgresql-common/createcluster.conf
  fi
else
  printf 'create_main_cluster = false\n' > /etc/postgresql-common/createcluster.conf
fi

apt-get update -qq
apt-get install -y --no-install-recommends postgresql-17 postgresql-client-17

if ! pg_lsclusters --no-header | awk '{print $1 "/" $2}' | grep -qx "17/${PG_CLUSTER}"; then
  pg_createcluster 17 "${PG_CLUSTER}" --port "${PG_PORT}" --start-conf=manual
fi

PG_CONF="/etc/postgresql/17/${PG_CLUSTER}/postgresql.conf"
sed -i "s/^#\?listen_addresses\s*=.*/listen_addresses = '127.0.0.1'/" "${PG_CONF}"
sed -i "s/^#\?port\s*=.*/port = ${PG_PORT}/" "${PG_CONF}"
sed -i "s/^#\?password_encryption\s*=.*/password_encryption = 'scram-sha-256'/" "${PG_CONF}"

cat > "/etc/postgresql/17/${PG_CLUSTER}/conf.d/cecrm.conf" <<'POSTGRES_CONFIG'
# CE CRM native cluster. It is API-only and never listens on a public address.
listen_addresses = '127.0.0.1'
timezone = 'UTC'
log_timezone = 'UTC'
password_encryption = 'scram-sha-256'
shared_buffers = '1GB'
effective_cache_size = '6GB'
maintenance_work_mem = '256MB'
work_mem = '8MB'
max_connections = 100
checkpoint_completion_target = 0.9
min_wal_size = '256MB'
max_wal_size = '2GB'
POSTGRES_CONFIG

if sudo -u postgres /usr/lib/postgresql/17/bin/pg_controldata \
  "/var/lib/postgresql/17/${PG_CLUSTER}" \
  | grep -q 'Data page checksum version:[[:space:]]*0'; then
  pg_ctlcluster 17 "${PG_CLUSTER}" stop || true
  sudo -u postgres /usr/lib/postgresql/17/bin/pg_checksums \
    --enable -D "/var/lib/postgresql/17/${PG_CLUSTER}"
fi
pg_ctlcluster 17 "${PG_CLUSTER}" start

# Install a pinned Node.js LTS binary directly from nodejs.org and verify it
# against the release checksum before exposing it in /usr/local/bin.
if [[ ! -x "${NODE_PREFIX}/bin/node" ]]; then
  work_dir="$(mktemp -d)"
  cleanup_node_download() {
    rm -f -- "${work_dir}/${NODE_ARCHIVE}" "${work_dir}/SHASUMS256.txt"
    rmdir -- "${work_dir}"
  }
  trap cleanup_node_download EXIT
  curl -fsSLo "${work_dir}/${NODE_ARCHIVE}" \
    "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
  curl -fsSLo "${work_dir}/SHASUMS256.txt" \
    "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  (
    cd "${work_dir}"
    grep " ${NODE_ARCHIVE}$" SHASUMS256.txt | sha256sum --check --strict
  )
  install -d -m 0755 "${NODE_PREFIX}"
  tar -xJf "${work_dir}/${NODE_ARCHIVE}" \
    --strip-components=1 -C "${NODE_PREFIX}"
fi

ln -sfn "${NODE_PREFIX}/bin/node" /usr/local/bin/node
ln -sfn "${NODE_PREFIX}/bin/npm" /usr/local/bin/npm
ln -sfn "${NODE_PREFIX}/bin/npx" /usr/local/bin/npx
ln -sfn "${NODE_PREFIX}/bin/corepack" /usr/local/bin/corepack

if ! id -u cecrm >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/ce-crm --create-home \
    --shell /usr/sbin/nologin cecrm
fi

install -d -o cecrm -g cecrm -m 0750 \
  /opt/ce-crm/app \
  /var/lib/ce-crm/attachments \
  /var/lib/ce-crm/tmp
install -d -o root -g cecrm -m 0750 /etc/ce-crm
install -d -o postgres -g postgres -m 0700 \
  /var/backups/ce-crm \
  /var/backups/ce-crm/wal

echo "Native host prepared. Existing containers were not modified."
echo "PostgreSQL: $(pg_config --version), cluster 17/${PG_CLUSTER}, localhost:${PG_PORT}"
echo "Node.js: $(node --version)"
echo "Next: run ops/prepare-native-caddy.sh to stage (but not start) the HTTPS proxy."
