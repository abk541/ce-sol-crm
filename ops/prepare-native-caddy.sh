#!/usr/bin/env bash
set -Eeuo pipefail

# Stage the host-native Caddy proxy without changing the running Docker ingress.
# The binary is copied byte-for-byte from the reviewed production container and
# must match the pinned release below. This script installs and validates the
# disabled host unit; the final cutover starts it explicitly after Docker Caddy
# has released ports 80 and 443.

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_CONTAINER="${CADDY_SOURCE_CONTAINER:-supabase-caddy}"
SOURCE_BINARY="${CADDY_SOURCE_BINARY:-/usr/bin/caddy}"
EXPECTED_VERSION="${CADDY_EXPECTED_VERSION:-2.11.4}"
TARGET_BINARY="/usr/local/bin/caddy"
TARGET_CONFIG="/etc/caddy/Caddyfile"
TARGET_UNIT="/etc/systemd/system/caddy-cecrm.service"
DATA_HOME="/var/lib/caddy/.local/share"
CONFIG_HOME="/var/lib/caddy/.config"

if [[ ! "${SOURCE_CONTAINER}" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]]; then
  echo "CADDY_SOURCE_CONTAINER contains unsupported characters." >&2
  exit 1
fi
if [[ ! "${SOURCE_BINARY}" =~ ^/[A-Za-z0-9_./-]+$ || "${SOURCE_BINARY}" == *'..'* ]]; then
  echo "CADDY_SOURCE_BINARY must be a safe absolute container path." >&2
  exit 1
fi
if [[ ! "${EXPECTED_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "CADDY_EXPECTED_VERSION must be a semantic version such as 2.11.4." >&2
  exit 1
fi

for command_name in cmp docker getent groupadd install runuser sha256sum systemctl useradd; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
done

if systemctl is-active --quiet caddy-cecrm.service \
  || systemctl is-active --quiet caddy.service; then
  echo "A host-native Caddy service is already active; refusing to replace its files." >&2
  exit 1
fi

container_running="$(docker inspect --format '{{.State.Running}}' "${SOURCE_CONTAINER}" 2>/dev/null)" || {
  echo "Cannot inspect source Caddy container: ${SOURCE_CONTAINER}" >&2
  exit 1
}
if [[ "${container_running}" != "true" ]]; then
  echo "Source Caddy container is not running: ${SOURCE_CONTAINER}" >&2
  exit 1
fi

source_version_output="$(docker exec "${SOURCE_CONTAINER}" "${SOURCE_BINARY}" version | tr -d '\r')"
source_release="${source_version_output%% *}"
if [[ "${source_release}" != "v${EXPECTED_VERSION}" ]]; then
  echo "Source Caddy is ${source_release}; expected reviewed release v${EXPECTED_VERSION}." >&2
  exit 1
fi

source_sha_line="$(docker exec "${SOURCE_CONTAINER}" sha256sum "${SOURCE_BINARY}" | tr -d '\r')"
source_sha="${source_sha_line%% *}"
if [[ ! "${source_sha}" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Could not obtain a valid SHA-256 digest from the source container." >&2
  exit 1
fi

work_dir="$(mktemp -d /var/tmp/ce-crm-caddy.XXXXXX)"
case "${work_dir}" in
  /var/tmp/ce-crm-caddy.*) ;;
  *) echo "Unsafe temporary directory: ${work_dir}" >&2; exit 1 ;;
esac
cleanup() {
  rm -f -- "${work_dir}/caddy"
  rmdir -- "${work_dir}" 2>/dev/null || true
}
trap cleanup EXIT

docker cp "${SOURCE_CONTAINER}:${SOURCE_BINARY}" "${work_dir}/caddy" >/dev/null
chmod 0755 "${work_dir}/caddy"

copied_sha="$(sha256sum "${work_dir}/caddy")"
copied_sha="${copied_sha%% *}"
if [[ "${copied_sha}" != "${source_sha}" ]]; then
  echo "Copied Caddy binary does not match the running container digest." >&2
  exit 1
fi
copied_version_output="$("${work_dir}/caddy" version | tr -d '\r')"
if [[ "${copied_version_output%% *}" != "v${EXPECTED_VERSION}" ]]; then
  echo "Copied Caddy binary failed its pinned version check." >&2
  exit 1
fi

# Refuse to overwrite unrelated host state. Re-running against files installed
# by this script is allowed and produces the same result.
if [[ -e "${TARGET_BINARY}" ]]; then
  existing_sha="$(sha256sum "${TARGET_BINARY}")"
  existing_sha="${existing_sha%% *}"
  if [[ "${existing_sha}" != "${source_sha}" ]]; then
    echo "${TARGET_BINARY} exists with a different digest; review it manually." >&2
    exit 1
  fi
fi
if [[ -e "${TARGET_CONFIG}" ]] \
  && ! cmp --silent "${SCRIPT_DIR}/Caddyfile.native" "${TARGET_CONFIG}"; then
  echo "${TARGET_CONFIG} already exists with different content; review it manually." >&2
  exit 1
fi
if [[ -e "${TARGET_UNIT}" ]] \
  && ! cmp --silent "${SCRIPT_DIR}/systemd/caddy-cecrm.service" "${TARGET_UNIT}"; then
  echo "${TARGET_UNIT} already exists with different content; review it manually." >&2
  exit 1
fi

if ! getent group caddy >/dev/null; then
  groupadd --system caddy
fi
if ! getent passwd caddy >/dev/null; then
  useradd --system \
    --gid caddy \
    --home-dir /var/lib/caddy \
    --no-create-home \
    --shell /usr/sbin/nologin \
    caddy
fi

install -d -o caddy -g caddy -m 0750 \
  /var/lib/caddy \
  /var/lib/caddy/.local \
  "${DATA_HOME}" \
  "${CONFIG_HOME}"
install -d -o root -g caddy -m 0750 /etc/caddy

if [[ ! -e "${TARGET_BINARY}" ]]; then
  install -o root -g root -m 0755 "${work_dir}/caddy" "${TARGET_BINARY}"
fi
install -o root -g caddy -m 0640 "${SCRIPT_DIR}/Caddyfile.native" "${TARGET_CONFIG}"
install -o root -g root -m 0644 \
  "${SCRIPT_DIR}/systemd/caddy-cecrm.service" "${TARGET_UNIT}"

systemctl daemon-reload
if systemctl is-enabled --quiet caddy-cecrm.service; then
  systemctl disable caddy-cecrm.service >/dev/null
fi

runuser --user caddy --group caddy -- env \
  XDG_DATA_HOME="${DATA_HOME}" \
  XDG_CONFIG_HOME="${CONFIG_HOME}" \
  "${TARGET_BINARY}" validate --config "${TARGET_CONFIG}" --adapter caddyfile

if systemctl is-active --quiet caddy-cecrm.service; then
  echo "Safety check failed: the staged Caddy service unexpectedly started." >&2
  exit 1
fi
if [[ "$(docker inspect --format '{{.State.Running}}' "${SOURCE_CONTAINER}")" != "true" ]]; then
  echo "Safety check failed: the source Caddy container is no longer running." >&2
  exit 1
fi

echo "Host-native Caddy v${EXPECTED_VERSION} is installed, validated, and disabled."
echo "The running Docker ingress was not stopped or restarted."
echo "At cutover, release ports 80/443 before enabling caddy-cecrm.service."
