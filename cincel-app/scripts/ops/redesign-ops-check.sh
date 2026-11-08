#!/usr/bin/env bash
# Checks the redesign ops steps on the deploy host (issue #913):
#   SESSION_SECRET and CRON_SECRET present in the app's env file and in the
#   running `app` container, the host crontab line installed, and one cron tick.
#
# Run it ON THE DEPLOY HOST, from the compose folder (the one with
# docker-compose.prod.yml and .env.production):
#
#   cd ~/apps/cincel-workspace/cincel-app
#   set -a; . ./.env; set +a          # REGISTRY_URL, IMAGE_TAG, POSTGRES_PASSWORD
#   scripts/ops/redesign-ops-check.sh all
#
# Steps (each one can run alone):
#   env     SESSION_SECRET / CRON_SECRET set in .env.production and in `app`
#   cron    the crontab of the current user calls /api/cron/tick
#   tick    one authenticated tick, prints the status and the JSON body
#   all     env, cron, tick
#
# It never prints a secret value, only its length. Exit code is non-zero when
# a check fails. Paste the output (it holds no secret) on the issue.
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.10.1}"

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

# Value of KEY from the env file (last assignment wins, quotes stripped).
env_file_value() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Value of KEY inside the running app container.
container_value() {
  local key="$1" id
  id="$(app_container)" || return 0
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$id" | sed -n "s/^${key}=//p" | tail -n 1
}

check_secret() {
  local key="$1" min="$2" file_val run_val
  file_val="$(env_file_value "$key")"
  run_val="$(container_value "$key")"
  if [[ -z "$file_val" ]]; then
    bad "$key missing in $ENV_FILE"
  elif (( ${#file_val} < min )); then
    bad "$key in $ENV_FILE is ${#file_val} chars, want at least $min (openssl rand -hex 32)"
  else
    ok "$key in $ENV_FILE (${#file_val} chars)"
  fi
  if [[ -z "$run_val" ]]; then
    bad "$key not set in the running app container (restart: docker compose -f $COMPOSE_FILE up -d app)"
  elif [[ -n "$file_val" && "$run_val" != "$file_val" ]]; then
    bad "$key in the running app differs from $ENV_FILE (restart: docker compose -f $COMPOSE_FILE up -d app)"
  else
    ok "$key set in the running app container"
  fi
}

step_env() {
  echo "== env"
  [[ -f "$ENV_FILE" ]] || bad "$ENV_FILE not found in $(pwd)"
  check_secret SESSION_SECRET 32
  check_secret CRON_SECRET 32
}

step_cron() {
  echo "== cron"
  local tab
  tab="$(crontab -l 2>/dev/null || true)"
  if grep -Eq '^[[:space:]]*\*[[:space:]]+\*[[:space:]]+\*[[:space:]]+\*[[:space:]]+\*[[:space:]].*/api/cron/tick' <<<"$tab"; then
    ok "per-minute crontab line calls /api/cron/tick (user $(id -un))"
  else
    bad "no per-minute /api/cron/tick line in the crontab of $(id -un) (docs/deployment.md, Host cron line)"
  fi
  if grep -Eq '^[[:space:]]*CRON_SECRET=.+' <<<"$tab"; then
    ok "crontab defines CRON_SECRET"
  else
    bad "crontab does not define CRON_SECRET=<value from $ENV_FILE>"
  fi
}

step_tick() {
  echo "== tick"
  local secret network out status body
  secret="$(env_file_value CRON_SECRET)"
  secret="${secret:-${CRON_SECRET:-}}"
  if [[ -z "$secret" ]]; then
    bad "CRON_SECRET unknown (set it in $ENV_FILE or export it)"
    return
  fi
  network="$(app_network)" || { bad "cannot find the app's docker network"; return; }
  out="$(docker run --rm --network "$network" "$CURL_IMAGE" \
    -sS -o - -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $secret" http://app:3000/api/cron/tick)" || { bad "curl failed"; return; }
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
  echo "network: $network"
  echo "HTTP $status"
  [[ -n "$body" ]] && echo "$body"
  case "$status" in
    200)
      ok "tick ran"
      for job in notifications-deliver daily-digest; do
        if grep -q "\"job\":\"$job\"" <<<"$body"; then
          ok "$job listed (ran or skipped with a reason)"
        else
          bad "$job missing from the tick report"
        fi
      done
      ;;
    204) bad "another tick held the lease; run the tick step again in a minute" ;;
    401) bad "wrong CRON_SECRET (the app and $ENV_FILE disagree; restart app)" ;;
    503) bad "CRON_SECRET not set in the app (restart app after adding it)" ;;
    *) bad "unexpected status $status" ;;
  esac
}

case "${1:-all}" in
  env) step_env ;;
  cron) step_cron ;;
  tick) step_tick ;;
  all) step_env; step_cron; step_tick ;;
  *) echo "usage: $0 env|cron|tick|all" >&2; exit 2 ;;
esac

exit "$fail"
