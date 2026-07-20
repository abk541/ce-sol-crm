#!/usr/bin/env bash
set -Eeuo pipefail

# Install the encrypted native backup job and create its age identity without
# printing private key material. Copy /etc/ce-crm/backup.agekey off the VPS
# immediately after running this script.

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
IDENTITY_FILE="/etc/ce-crm/backup.agekey"
ENV_FILE="/etc/ce-crm/backup.env"

for required_file in \
  "${SCRIPT_DIR}/ce-crm-backup.sh" \
  "${SCRIPT_DIR}/systemd/ce-crm-backup.service" \
  "${SCRIPT_DIR}/systemd/ce-crm-backup.timer"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Missing deployment file: ${required_file}" >&2
    exit 1
  fi
done

if [[ ! -d /etc/ce-crm ]] || [[ ! -d /var/backups/ce-crm ]]; then
  echo "Native backup directories are missing; run bootstrap-native-host.sh first." >&2
  exit 1
fi

if [[ ! -s "${IDENTITY_FILE}" ]]; then
  temporary_identity="$(mktemp /etc/ce-crm/.backup.agekey.XXXXXX)"
  age-keygen 2>/dev/null > "${temporary_identity}"
  install -o root -g root -m 0600 "${temporary_identity}" "${IDENTITY_FILE}"
  rm -f -- "${temporary_identity}"
fi
chmod 0600 "${IDENTITY_FILE}"
chown root:root "${IDENTITY_FILE}"

recipient="$(age-keygen -y "${IDENTITY_FILE}")"
if [[ ! "${recipient}" =~ ^age1[0-9a-z]+$ ]]; then
  echo "Could not derive a valid age recipient from the backup identity." >&2
  exit 1
fi

temporary_env="$(mktemp /etc/ce-crm/.backup.env.XXXXXX)"
cleanup() {
  rm -f -- "${temporary_env}"
}
trap cleanup EXIT
{
  printf 'AGE_RECIPIENT=%s\n' "${recipient}"
  printf 'AGE_IDENTITY_FILE=%s\n' "${IDENTITY_FILE}"
  printf 'RETENTION_DAYS=14\n'
} > "${temporary_env}"
install -o root -g root -m 0600 "${temporary_env}" "${ENV_FILE}"

install -o root -g root -m 0750 \
  "${SCRIPT_DIR}/ce-crm-backup.sh" /usr/local/sbin/ce-crm-backup
install -o root -g root -m 0644 \
  "${SCRIPT_DIR}/systemd/ce-crm-backup.service" \
  "${SCRIPT_DIR}/systemd/ce-crm-backup.timer" \
  /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now ce-crm-backup.timer

echo "Encrypted native backups are installed and scheduled."
echo "Copy ${IDENTITY_FILE} to a secure off-VPS location before relying on the schedule."
echo "Run systemctl start ce-crm-backup.service to create and verify a backup now."
