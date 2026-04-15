#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/jeeves}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
BACKEND_DIR="${APP_DIR}/backend"
COMPOSE_FILE="${APP_DIR}/deploy/docker-compose.yml"
COMPOSE_ENV_FILE="${APP_DIR}/deploy/.env.compose"

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

log "Checking server dependencies"
require_command git
require_command docker

if ! docker compose version >/dev/null 2>&1; then
  printf 'Missing required command: docker compose\n' >&2
  exit 1
fi

require_file "${BACKEND_DIR}/.env"
require_file "${COMPOSE_FILE}"
require_file "${COMPOSE_ENV_FILE}"

log "Updating repository"
cd "${APP_DIR}"
git fetch --all --prune
git checkout "${DEPLOY_BRANCH}"
git pull --ff-only origin "${DEPLOY_BRANCH}"

log "Building Docker images"
docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" build --pull

log "Starting containers"
docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

log "Current container status"
docker compose --env-file "${COMPOSE_ENV_FILE}" -f "${COMPOSE_FILE}" ps

log "Deployment finished"
