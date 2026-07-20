#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this backup as root." >&2
  exit 1
fi

umask 0077

: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required for verification}"

BACKUP_DIR="/var/backups/ce-crm"
ATTACHMENTS_DIR="/var/lib/ce-crm/attachments"
DATABASE_NAME="ce_crm"
DATABASE_PORT="5433"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

resolved_backup_dir="$(realpath -e "${BACKUP_DIR}")"
if [[ "${resolved_backup_dir}" != "/var/backups/ce-crm" ]]; then
  echo "Unexpected backup directory: ${resolved_backup_dir}" >&2
  exit 1
fi
if [[ ! "${RETENTION_DAYS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

exec 9>"${BACKUP_DIR}/.backup.lock"
chmod 0600 "${BACKUP_DIR}/.backup.lock"
if ! flock --nonblock 9; then
  echo "Another CE CRM backup is already running." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d "${BACKUP_DIR}/.backup.XXXXXX")"
verify_dir="$(mktemp -d "${BACKUP_DIR}/.verify.XXXXXX")"
archive_name="ce-crm-${stamp}.tar.age"
archive="${BACKUP_DIR}/${archive_name}"
temporary_archive="${archive}.tmp"
temporary_created=false
archive_moved=false
archive_verified=false

case "${work_dir}" in
  /var/backups/ce-crm/.backup.*) ;;
  *) echo "Unsafe temporary directory: ${work_dir}" >&2; exit 1 ;;
esac
case "${verify_dir}" in
  /var/backups/ce-crm/.verify.*) ;;
  *) echo "Unsafe verification directory: ${verify_dir}" >&2; exit 1 ;;
esac

cleanup() {
  rm -f -- \
    "${work_dir}/database.dump" \
    "${work_dir}/attachments.tar.gz" \
    "${work_dir}/manifest.sha256" \
    "${verify_dir}/database.dump" \
    "${verify_dir}/attachments.tar.gz" \
    "${verify_dir}/manifest.sha256" \
    "${verify_dir}/members.txt"
  if [[ "${temporary_created}" == true ]]; then
    rm -f -- "${temporary_archive}"
  fi
  if [[ "${archive_moved}" == true && "${archive_verified}" != true ]]; then
    rm -f -- "${archive}" "${archive}.sha256"
  fi
  rmdir -- "${work_dir}" 2>/dev/null || true
  rmdir -- "${verify_dir}" 2>/dev/null || true
}
trap cleanup EXIT

if [[ -e "${archive}" || -e "${archive}.sha256" || -e "${temporary_archive}" ]]; then
  echo "Backup filename collision for timestamp ${stamp}; refusing to overwrite it." >&2
  exit 1
fi

# The shell opens the output as root before pg_dump drops to postgres. A
# root-created mktemp directory is mode 0700, so asking postgres to open a file
# inside it directly would fail with EACCES.
sudo -u postgres /usr/lib/postgresql/17/bin/pg_dump \
  --port="${DATABASE_PORT}" \
  --dbname="${DATABASE_NAME}" \
  --format=custom \
  --compress=9 \
  --no-owner > "${work_dir}/database.dump"

tar --exclude='./.tmp' -czf "${work_dir}/attachments.tar.gz" \
  -C "${ATTACHMENTS_DIR}" .

temporary_created=true
(
  cd "${work_dir}"
  sha256sum database.dump attachments.tar.gz > manifest.sha256
  tar -cf - database.dump attachments.tar.gz manifest.sha256
) | age --recipient "${AGE_RECIPIENT}" --output "${temporary_archive}"

chmod 0600 "${temporary_archive}"

# Fully authenticate/decrypt the encrypted stream, require the exact expected
# member set, extract only those members, and validate the inner checksums and
# archive formats before retention cleanup. This catches a wrong recipient,
# truncated ciphertext, missing attachment archive, or damaged dump.
age --decrypt --identity "${AGE_IDENTITY_FILE}" "${temporary_archive}" \
  | tar --list --file=- > "${verify_dir}/members.txt"

mapfile -t archive_members < "${verify_dir}/members.txt"
expected_members=(database.dump attachments.tar.gz manifest.sha256)
if [[ ${#archive_members[@]} -ne ${#expected_members[@]} ]]; then
  echo "Encrypted backup contains an unexpected number of members." >&2
  exit 1
fi
for index in "${!expected_members[@]}"; do
  if [[ "${archive_members[index]}" != "${expected_members[index]}" ]]; then
    echo "Unexpected encrypted backup member: ${archive_members[index]}" >&2
    exit 1
  fi
done

age --decrypt --identity "${AGE_IDENTITY_FILE}" "${temporary_archive}" \
  | tar --extract --file=- \
      --directory="${verify_dir}" \
      --no-same-owner \
      --no-same-permissions \
      -- database.dump attachments.tar.gz manifest.sha256

(
  cd "${verify_dir}"
  sha256sum --check --strict manifest.sha256
)
/usr/lib/postgresql/17/bin/pg_restore \
  --list "${verify_dir}/database.dump" > /dev/null
tar --list --gzip --file="${verify_dir}/attachments.tar.gz" > /dev/null

mv -- "${temporary_archive}" "${archive}"
archive_moved=true
(
  cd "${BACKUP_DIR}"
  sha256sum "${archive_name}" > "${archive_name}.sha256"
)
chmod 0600 "${archive}.sha256"
(
  cd "${BACKUP_DIR}"
  sha256sum --check --strict "${archive_name}.sha256"
)
archive_verified=true

find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'ce-crm-*.tar.age' -o -name 'ce-crm-*.tar.age.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

echo "Verified encrypted backup: ${archive}"
