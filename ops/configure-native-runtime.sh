#!/usr/bin/env bash
set -Eeuo pipefail

# Create the native database login and the API's private systemd environment.
# This script never prints generated credentials. Run it as root after the
# native restore and ACL migration have completed.

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

DATABASE_NAME="ce_crm"
DATABASE_PORT="5433"
ENV_FILE="/etc/ce-crm/api.env"
SAM_SOURCE_ENV="${SAM_SOURCE_ENV:-/opt/supabase/.env.functions}"

if [[ ! -d /etc/ce-crm ]] || [[ ! -d /var/lib/ce-crm/attachments ]]; then
  echo "Native runtime directories are missing; run bootstrap-native-host.sh first." >&2
  exit 1
fi

if ! getent group cecrm >/dev/null || ! id -u cecrm >/dev/null 2>&1; then
  echo "The cecrm service account is missing." >&2
  exit 1
fi

if ! sudo -u postgres psql -XAtq -p "${DATABASE_PORT}" -d postgres \
  -c "select 1 from pg_roles where rolname = 'app_runtime'" | grep -qx 1; then
  echo "The app_runtime database role is missing." >&2
  exit 1
fi

database_password="$(openssl rand -hex 32)"
sam_key=""
if [[ -r "${SAM_SOURCE_ENV}" ]]; then
  sam_key="$(sed -n 's/^SAM_GOV_API_KEY=//p' "${SAM_SOURCE_ENV}" | head -n 1)"
elif sudo test -r "${SAM_SOURCE_ENV}"; then
  sam_key="$(sudo sed -n 's/^SAM_GOV_API_KEY=//p' "${SAM_SOURCE_ENV}" | head -n 1)"
fi

if [[ -n "${sam_key}" && ! "${sam_key}" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "The SAM.gov key contains characters that are unsafe in a systemd EnvironmentFile." >&2
  exit 1
fi

sudo -u postgres psql -X -v ON_ERROR_STOP=1 \
  -v runtime_password="${database_password}" \
  -p "${DATABASE_PORT}" -d postgres <<'SQL'
alter role app_runtime login password :'runtime_password';
SQL

temporary_env="$(mktemp /etc/ce-crm/.api.env.XXXXXX)"
cleanup() {
  rm -f -- "${temporary_env}"
}
trap cleanup EXIT

{
  printf 'DATABASE_URL=postgresql://app_runtime:%s@127.0.0.1:%s/%s\n' \
    "${database_password}" "${DATABASE_PORT}" "${DATABASE_NAME}"
  printf 'HOST=127.0.0.1\n'
  printf 'PORT=3001\n'
  printf 'TRUST_PROXY=true\n'
  printf 'LOG_LEVEL=info\n'
  printf 'ALLOWED_ORIGINS=https://crm.cesolutionplus.com,https://abk541.github.io\n'
  printf 'ATTACHMENTS_DIR=/var/lib/ce-crm/attachments\n'
  printf 'MAX_UPLOAD_BYTES=26214400\n'
  printf 'SAM_GOV_API_KEY=%s\n' "${sam_key}"
  printf 'SAM_GOV_TIMEOUT_MS=20000\n'
  printf 'SAM_GOV_MAX_RESPONSE_BYTES=5242880\n'
  printf 'SESSION_TTL_SECONDS=86400\n'
  printf 'LOGIN_RATE_LIMIT_MAX=8\n'
  printf 'LOGIN_RATE_LIMIT_WINDOW=1 minute\n'
} > "${temporary_env}"

install -o root -g cecrm -m 0640 "${temporary_env}" "${ENV_FILE}"

PGPASSWORD="${database_password}" psql -XAtq \
  -h 127.0.0.1 -p "${DATABASE_PORT}" -U app_runtime -d "${DATABASE_NAME}" \
  -c 'select 1' | grep -qx 1

echo "Native API credentials configured and database login verified."
