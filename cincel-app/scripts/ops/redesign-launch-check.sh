#!/usr/bin/env bash
# Checks the redesign launch on the deploy host (issue #923): the running app
# is cincel-app v0.37.0 or newer, every migration shipped in the image is
# applied (the redesign one, 0026_redesign_contracts, included), and the
# public routes answer the way a signed-out browser expects.
#
# Run it ON THE DEPLOY HOST, from the compose folder (the one with
# docker-compose.prod.yml and .env.production):
#
#   cd ~/apps/cincel-workspace/cincel-app
#   set -a; . ./.env; set +a          # REGISTRY_URL, IMAGE_TAG, POSTGRES_PASSWORD
#   scripts/ops/redesign-launch-check.sh all
#
# Steps (each one can run alone):
#   version   the running app image is release >= MIN_VERSION (its X.Y.Z tag)
#   migrate   rows in drizzle.__drizzle_migrations = migrations in the image,
#             and the redesign tables exist
#   http      /api/healthz 200, /login 200, /inicio and /tareas redirect a
#             signed-out request to /login
#   all       version, migrate, http
#
# The signed-in smoke test (Inicio, Tareas, a project, Personas, Mi espacio,
# Ajustes, the assistant) is manual: docs/redesign-launch.md, step 4.
#
# It prints no secret. Exit code is non-zero when a check fails. Paste the
# output on the issue.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.10.1}"
MIN_VERSION="${MIN_VERSION:-0.37.0}"
POSTGRES_USER="${POSTGRES_USER:-cincel}"
POSTGRES_DB="${POSTGRES_DB:-cincel}"

fail=0
ok() { printf 'OK    %s\n' "$*"; }
bad() { printf 'FAIL  %s\n' "$*"; fail=1; }

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

app_container() {
  local id
  id="$(compose ps -q app 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    echo "The app service is not running (docker compose -f $COMPOSE_FILE ps)." >&2
    return 1
  fi
  printf '%s' "$id"
}

app_network() {
  local id
  id="$(app_container)" || return 1
  docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' "$id" | head -n 1
}

# 0 when $1 >= $2 (both X.Y.Z).
version_ge() {
  [[ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n 1)" == "$2" ]]
}

psql_value() {
  compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null | tr -d '[:space:]'
}

# Release version of the running app: the X.Y.Z tag of its image (the ref
# compose started it with, or any other tag of the same image id). CI tags
# every release image with its version; `latest` or a commit SHA alone says
# nothing, so pull the version tag too (docker pull <registry>/cincel-app:X.Y.Z).
step_version() {
  echo "== version"
  local id image image_id version
  id="$(app_container)" || { bad "app is not running"; return; }
  image="$(docker inspect -f '{{.Config.Image}}' "$id")"
  image_id="$(docker inspect -f '{{.Image}}' "$id")"
  echo "image: $image"
  version="$(
    { printf '%s\n' "$image"; docker image inspect -f '{{range .RepoTags}}{{println .}}{{end}}' "$image_id" 2>/dev/null; } \
      | sed -n 's/.*:\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$/\1/p' | sort -V | tail -n 1
  )"
  if [[ -z "$version" ]]; then
    bad "no X.Y.Z tag on the running image; deploy a release tag (IMAGE_TAG=$MIN_VERSION or newer), or read the version in Ajustes › General"
  elif version_ge "$version" "$MIN_VERSION"; then
    ok "cincel-app v$version (>= $MIN_VERSION)"
  else
    bad "cincel-app v$version is older than $MIN_VERSION; set IMAGE_TAG to the latest release and redeploy"
  fi
}

step_migrate() {
  echo "== migrate"
  local id tmp shipped applied missing
  id="$(app_container)" || { bad "app is not running"; return; }
  tmp="$(mktemp)"
  if docker cp "$id:/app/lib/db/migrations/meta/_journal.json" "$tmp" >/dev/null 2>&1; then
    shipped="$(grep -c '"tag"' "$tmp" || true)"
  else
    shipped=""
  fi
  rm -f "$tmp"
  applied="$(psql_value 'select count(*) from drizzle.__drizzle_migrations')"
  if [[ -z "$applied" ]]; then
    bad "cannot read drizzle.__drizzle_migrations (is db up? docker compose -f $COMPOSE_FILE ps)"
  elif [[ -z "$shipped" ]]; then
    bad "cannot read the migration journal from the app image"
  elif (( applied >= shipped )); then
    ok "$applied of $shipped migrations applied"
  else
    bad "$applied of $shipped migrations applied; run: docker compose -f $COMPOSE_FILE run --rm migrate"
  fi
  for table in user_preferences notifications reminders cron_runs; do
    if [[ "$(psql_value "select to_regclass('core.$table') is not null")" == "t" ]]; then
      ok "core.$table exists (0026_redesign_contracts)"
    else
      bad "core.$table missing; the redesign migration did not run"
    fi
  done
}

# Prints "<status> <redirect path>" for a signed-out GET of $1.
probe() {
  local network="$1" path="$2"
  docker run --rm --network "$network" "$CURL_IMAGE" \
    -sS -o /dev/null -w '%{http_code} %{redirect_url}' "http://app:3000$path"
}

step_http() {
  echo "== http"
  local network out status location
  network="$(app_network)" || { bad "cannot find the app's docker network"; return; }
  for path in /api/healthz /login; do
    out="$(probe "$network" "$path")" || { bad "curl $path failed"; continue; }
    status="${out%% *}"
    if [[ "$status" == "200" ]]; then ok "GET $path -> 200"; else bad "GET $path -> $status"; fi
  done
  for path in /inicio /tareas; do
    out="$(probe "$network" "$path")" || { bad "curl $path failed"; continue; }
    status="${out%% *}"
    location="${out#* }"
    if [[ "$status" =~ ^30[0-9]$ && "$location" == *"/login"* ]]; then
      ok "GET $path signed out -> $status /login"
    else
      bad "GET $path signed out -> $status ${location:-<no redirect>} (want a redirect to /login)"
    fi
  done
}

case "${1:-all}" in
  version) step_version ;;
  migrate) step_migrate ;;
  http) step_http ;;
  all) step_version; step_migrate; step_http ;;
  *) echo "usage: $0 version|migrate|http|all" >&2; exit 2 ;;
esac

exit "$fail"
