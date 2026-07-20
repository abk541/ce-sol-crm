#!/usr/bin/env bash
set -Eeuo pipefail

# Restore one encrypted native backup into an isolated disposable database and
# compare exact table counts with the current native database. The fixed test
# database name is never reused or dropped if it existed before this run.

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

archive="${1:-}"
if [[ -z "${archive}" ]]; then
  echo "Usage: $0 /var/backups/ce-crm/ce-crm-TIMESTAMP.tar.age" >&2
  exit 1
fi

archive="$(realpath -e "${archive}")"
case "${archive}" in
  /var/backups/ce-crm/ce-crm-*.tar.age) ;;
  *) echo "Refusing to restore an archive outside the CE CRM backup directory." >&2; exit 1 ;;
esac

source /etc/ce-crm/backup.env
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required}"

SOURCE_DATABASE="ce_crm"
TEST_DATABASE="ce_crm_restore_test"
DATABASE_PORT="5433"

if sudo -u postgres psql -XAtq -p "${DATABASE_PORT}" -d postgres \
  -c "select 1 from pg_database where datname = '${TEST_DATABASE}'" | grep -qx 1; then
  echo "${TEST_DATABASE} already exists; refusing to drop or reuse it." >&2
  exit 1
fi

work_dir="$(mktemp -d /var/backups/ce-crm/.restore-test.XXXXXX)"
created_database=false
cleanup() {
  if [[ "${created_database}" == true ]]; then
    sudo -u postgres dropdb --if-exists --force -p "${DATABASE_PORT}" "${TEST_DATABASE}"
  fi
  rm -f -- \
    "${work_dir}/database.dump" \
    "${work_dir}/attachments.tar.gz" \
    "${work_dir}/manifest.sha256"
  rmdir -- "${work_dir}" 2>/dev/null || true
}
trap cleanup EXIT

case "${work_dir}" in
  /var/backups/ce-crm/.restore-test.*) ;;
  *) echo "Unsafe restore-test directory: ${work_dir}" >&2; exit 1 ;;
esac

age --decrypt --identity "${AGE_IDENTITY_FILE}" "${archive}" \
  | tar --extract --file=- \
      --directory="${work_dir}" \
      --no-same-owner \
      --no-same-permissions \
      -- database.dump attachments.tar.gz manifest.sha256

(
  cd "${work_dir}"
  sha256sum --check --strict manifest.sha256
)

sudo -u postgres createdb \
  -p "${DATABASE_PORT}" \
  --owner=app_owner \
  --template=template0 \
  --encoding=UTF8 \
  --locale=C.UTF-8 \
  "${TEST_DATABASE}"
created_database=true

sudo -u postgres /usr/lib/postgresql/17/bin/pg_restore \
  -p "${DATABASE_PORT}" \
  -d "${TEST_DATABASE}" \
  --role=app_owner \
  --no-owner \
  --single-transaction \
  --exit-on-error < "${work_dir}/database.dump"

table_counts() {
  local database_name="$1"
  sudo -u postgres psql -XAtq -p "${DATABASE_PORT}" -d "${database_name}" <<'SQL'
select format(
  'select %L, count(*) from %I.%I;',
  schemaname || '.' || tablename,
  schemaname,
  tablename
)
from pg_tables
where schemaname in ('public', 'app_auth', 'app_files', 'app_events')
order by schemaname, tablename
\gexec
SQL
}

source_counts="$(table_counts "${SOURCE_DATABASE}")"
restored_counts="$(table_counts "${TEST_DATABASE}")"
if [[ "${source_counts}" != "${restored_counts}" ]]; then
  echo "Restored table counts do not match the source database." >&2
  exit 1
fi

invalid_constraints="$(sudo -u postgres psql -XAtq -p "${DATABASE_PORT}" \
  -d "${TEST_DATABASE}" -c 'select count(*) from pg_constraint where not convalidated')"
if [[ "${invalid_constraints}" != "0" ]]; then
  echo "The restored database contains unvalidated constraints." >&2
  exit 1
fi

echo "Disposable native backup restore passed with matching table counts."
