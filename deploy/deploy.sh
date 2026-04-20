#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${APP_DIR:-${DEFAULT_APP_DIR}}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
BACKEND_DIR="${APP_DIR}/backend"
COMPOSE_FILE="${APP_DIR}/deploy/docker-compose.yml"
COMPOSE_ENV_FILE="${APP_DIR}/deploy/.env.compose"
COMPOSE_CMD=()
COMPOSE_IS_LEGACY=0

export PATH="${HOME}/.local/bin:${PATH}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1"
}

require_file() {
  local file_path="$1"
  if [[ ! -f "${file_path}" ]]; then
    printf 'Missing required file: %s\n' "${file_path}" >&2
    exit 1
  fi
}

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "${command_name}" >&2
    exit 1
  fi
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    COMPOSE_IS_LEGACY=1
    return
  fi

  printf 'Missing required command: docker compose or docker-compose\n' >&2
  exit 1
}

log "Checking server dependencies"
require_command git
require_command docker
detect_compose

require_file "${BACKEND_DIR}/.env"
require_file "${COMPOSE_FILE}"
require_file "${COMPOSE_ENV_FILE}"

cd "${APP_DIR}"
if [[ "${SKIP_REPO_UPDATE:-0}" == "1" ]]; then
  log "Repository already updated"
else
  log "Updating repository"
  git fetch --all --prune
  git checkout "${DEPLOY_BRANCH}"
  git pull --ff-only origin "${DEPLOY_BRANCH}"
fi

log "Building Docker images"
"${COMPOSE_CMD[@]}" --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" build --pull

if [[ "${COMPOSE_IS_LEGACY}" == "1" ]]; then
  log "Stopping existing containers for legacy docker-compose compatibility"
  "${COMPOSE_CMD[@]}" --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" down --remove-orphans
fi

log "Starting containers"
"${COMPOSE_CMD[@]}" --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

log "Current container status"
"${COMPOSE_CMD[@]}" --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" ps

log "Deployment finished"
