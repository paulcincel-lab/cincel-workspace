#!/usr/bin/env bash
# Pre-deploy checks for the project-flow drops release (migration 0025).
#
# After 0025 the only rollback is a database restore (ADR 0003), so this script
# takes the production backup, proves it restores, runs the data checks and
# rehearses 0025 on the restored copy before the release is deployed.
#
# Run it ON THE PRODUCTION HOST, from the production compose folder (the one
# with docker-compose.prod.yml), with the same env the deploy uses:
#
#   cd ~/apps/cincel-workspace/cincel-app
#   set -a; . ./.env; set +a          # REGISTRY_URL, IMAGE_TAG, POSTGRES_PASSWORD
#   NEW_IMAGE_TAG=<release B tag> scripts/ops/drops-predeploy.sh all
#
# Steps (each one can run alone, in this order):
#   backup    pg_dump -Fc of production + sha256         (read-only on prod)
#   restore   restores the dump into a scratch container, compares row counts
#   check     null phase_id count on production, must be 0 (read-only)
#   report    npm run flow:report against production       (read-only)
#   rehearse  applies the release B migrations (0025) to the scratch copy
#   cleanup   removes the scratch container and network (the copy holds PII)
#   all       backup, restore, check, report, rehearse, cleanup
#
# Every step writes its output to $OUT_DIR (default ~/cincel-predeploy-0025/<ts>)
# so it can be pasted on the release issue. When running steps one by one,
# export the same OUT_DIR for all of them. The scratch database has no host
# port; it is only reachable on its own docker network.
#
# Stop the app first (docker compose -f docker-compose.prod.yml stop app) and
# deploy right after: anything written after the backup would be lost by a
# restore, and the restore step fails when row counts drift from production.
#
# Env:
#   COMPOSE_FILE       default docker-compose.prod.yml
#   POSTGRES_USER/DB   default cincel / cincel
#   REGISTRY_URL       registry of the migrate images (required by the compose file)
#   IMAGE_TAG          tag deployed now (required by the compose file; runs flow:report)
#   NEW_IMAGE_TAG      tag of the release that ships 0025 (rehearse only)
#   REPORT_IMAGE_TAG   tag used for flow:report, default IMAGE_TAG
#   BACKUP_DIR         default ~/cincel-backups
#   OUT_DIR            default ~/cincel-predeploy-0025/<UTC timestamp>
#   DUMP_FILE          reuse an existing dump instead of the newest one in BACKUP_DIR
set -euo pipefail

STEP="${1:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
PG_USER="${POSTGRES_USER:-cincel}"
PG_DB="${POSTGRES_DB:-cincel}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/cincel-backups}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-$HOME/cincel-predeploy-0025/$TS}"
SCRATCH_NAME="cincel-predeploy-0025-db"
SCRATCH_NET="cincel-predeploy-0025-net"
SCRATCH_PW_FILE="$BACKUP_DIR/.scratch-0025-password"

case "$STEP" in
  backup|restore|check|report|rehearse|cleanup|all) ;;
  *) sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

mkdir -p "$BACKUP_DIR" "$OUT_DIR"
chmod 700 "$BACKUP_DIR" "$OUT_DIR"

log() { printf '%s %s\n' "$(date -u +%H:%M:%SZ)" "$*" | tee -a "$OUT_DIR/run.log" >&2; }
die() { log "ERROR: $*"; exit 1; }

prod_db() {
  local id
  id="$(docker compose -f "$COMPOSE_FILE" ps -q db)"
  [ -n "$id" ] || die "production db container not found (compose file $COMPOSE_FILE)"
  printf '%s' "$id"
}

prod_psql() { docker exec -i "$(prod_db)" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -X -At "$@"; }
scratch_psql() { docker exec -i "$SCRATCH_NAME" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -X -At "$@"; }

latest_dump() {
  if [ -n "${DUMP_FILE:-}" ]; then printf '%s' "$DUMP_FILE"; return; fi
  ls -1t "$BACKUP_DIR"/cincel-before-0025-*.dump 2>/dev/null | head -n1
}

# Exact row count of every base table, one "schema.table|count" line each.
ROW_COUNTS_SQL="
select t.table_schema || '.' || t.table_name || '|' ||
  (xpath('/row/c/text()', query_to_xml(
    format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text
from information_schema.tables t
where t.table_type = 'BASE TABLE'
  and t.table_schema not in ('pg_catalog', 'information_schema')
order by 1;"

step_backup() {
  local dump="$BACKUP_DIR/cincel-before-0025-$TS.dump"
  log "backup: pg_dump of production to $dump"
  docker exec "$(prod_db)" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc > "$dump"
  [ -s "$dump" ] || die "backup is empty"
  chmod 600 "$dump"
  (cd "$BACKUP_DIR" && sha256sum "$(basename "$dump")" > "$(basename "$dump").sha256")
  prod_psql -c "$ROW_COUNTS_SQL" > "$OUT_DIR/prod-row-counts.txt"
  prod_psql -c "select count(*) || ' migrations, last ' || max(created_at) from drizzle.__drizzle_migrations" \
    > "$OUT_DIR/prod-migrations.txt"
  {
    echo "### Backup"
    echo "- file: \`$dump\`"
    echo "- size: $(du -h "$dump" | cut -f1)"
    echo "- sha256: \`$(cut -d' ' -f1 "$dump.sha256")\`"
    echo "- taken: $TS (UTC)"
    echo "- production journal: $(cat "$OUT_DIR/prod-migrations.txt")"
  } | tee "$OUT_DIR/backup.md"
}

start_scratch() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$SCRATCH_NAME"; then
    die "$SCRATCH_NAME already exists; run '$0 cleanup' first"
  fi
  docker network inspect "$SCRATCH_NET" >/dev/null 2>&1 || docker network create "$SCRATCH_NET" >/dev/null
  openssl rand -hex 24 > "$SCRATCH_PW_FILE"
  chmod 600 "$SCRATCH_PW_FILE"
  docker run -d --name "$SCRATCH_NAME" --network "$SCRATCH_NET" \
    -e POSTGRES_USER="$PG_USER" -e POSTGRES_DB="$PG_DB" \
    -e POSTGRES_PASSWORD="$(cat "$SCRATCH_PW_FILE")" \
    postgres:17-alpine >/dev/null
  local i=0
  until docker exec "$SCRATCH_NAME" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -lt 60 ] || die "scratch database did not start"; sleep 1
  done
  # pg_isready answers during the init restart; wait for a real query.
  i=0
  until scratch_psql -c 'select 1' >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -lt 60 ] || die "scratch database did not accept queries"; sleep 1
  done
}

step_restore() {
  local dump
  dump="$(latest_dump)"
  [ -n "$dump" ] && [ -f "$dump" ] || die "no dump found; run '$0 backup' first"
  log "restore: verifying checksum of $dump"
  (cd "$(dirname "$dump")" && sha256sum -c "$(basename "$dump").sha256") | tee -a "$OUT_DIR/run.log"
  log "restore: starting scratch database $SCRATCH_NAME"
  start_scratch
  log "restore: pg_restore into the scratch database"
  docker exec -i "$SCRATCH_NAME" pg_restore -U "$PG_USER" -d "$PG_DB" \
    --no-owner --no-acl --single-transaction --exit-on-error < "$dump"
  scratch_psql -c "$ROW_COUNTS_SQL" > "$OUT_DIR/scratch-row-counts.txt"
  [ -f "$OUT_DIR/prod-row-counts.txt" ] || prod_psql -c "$ROW_COUNTS_SQL" > "$OUT_DIR/prod-row-counts.txt"
  local result tables
  tables="$(wc -l < "$OUT_DIR/scratch-row-counts.txt" | tr -d ' ')"
  if diff -u "$OUT_DIR/prod-row-counts.txt" "$OUT_DIR/scratch-row-counts.txt" > "$OUT_DIR/row-counts.diff"; then
    result="every table matches production ($tables tables)"
  else
    # Rows written on production after the dump also show up here; rerun
    # backup + restore in a quiet window if the diff is not explained by that.
    result="row counts differ, see $OUT_DIR/row-counts.diff"
  fi
  {
    echo "### Restore verification"
    echo "- dump: \`$dump\` (checksum OK)"
    echo "- restored into a scratch postgres:17-alpine container, single transaction, no errors"
    echo "- row counts: $result"
    echo "- core.projects: $(scratch_psql -c 'select count(*) from core.projects')"
    echo "- core.tasks: $(scratch_psql -c 'select count(*) from core.tasks')"
  } | tee "$OUT_DIR/restore.md"
  [ -s "$OUT_DIR/row-counts.diff" ] && die "row counts differ between production and the restored copy"
  return 0
}

step_check() {
  log "check: null phase_id count on production"
  local n
  n="$(prod_psql -c 'select count(*) from core.workflow_task_templates where phase_id is null')"
  {
    echo "### Null phase_id check (production)"
    echo '```'
    echo 'select count(*) from core.workflow_task_templates where phase_id is null;'
    echo "$n"
    echo '```'
  } | tee "$OUT_DIR/check.md"
  [ "$n" = "0" ] || die "$n templates have no phase_id; fix them in Etapas y fases before deploying 0025"
}

step_report() {
  local tag="${REPORT_IMAGE_TAG:-${IMAGE_TAG:?IMAGE_TAG must be set}}"
  log "report: npm run flow:report against production (image tag $tag)"
  IMAGE_TAG="$tag" docker compose -f "$COMPOSE_FILE" run --rm --no-deps -T migrate \
    npm run --silent flow:report > "$OUT_DIR/flow-report.md"
  log "report: saved to $OUT_DIR/flow-report.md ($(wc -l < "$OUT_DIR/flow-report.md" | tr -d ' ') lines)"
}

step_rehearse() {
  : "${REGISTRY_URL:?REGISTRY_URL must be set}"
  : "${NEW_IMAGE_TAG:?NEW_IMAGE_TAG must be set to the release that ships 0025}"
  docker ps --format '{{.Names}}' | grep -qx "$SCRATCH_NAME" || die "scratch database is not running; run '$0 restore' first"
  local image="$REGISTRY_URL/cincel-app-migrate:$NEW_IMAGE_TAG"
  local before after
  before="$(scratch_psql -c 'select count(*) from drizzle.__drizzle_migrations')"
  scratch_psql -c "select 'core.projects|' || count(*) from core.projects union all select 'core.tasks|' || count(*) from core.tasks union all select 'core.workflow_task_templates|' || count(*) from core.workflow_task_templates" \
    > "$OUT_DIR/rehearse-before.txt"
  log "rehearse: npm run db:migrate with $image on the scratch copy"
  docker pull "$image" >/dev/null
  docker run --rm --network "$SCRATCH_NET" \
    -e DATABASE_URL="postgres://$PG_USER:$(cat "$SCRATCH_PW_FILE")@$SCRATCH_NAME:5432/$PG_DB" \
    "$image" npm run db:migrate 2>&1 | tee "$OUT_DIR/rehearse-migrate.log"
  after="$(scratch_psql -c 'select count(*) from drizzle.__drizzle_migrations')"
  scratch_psql -c "select 'core.projects|' || count(*) from core.projects union all select 'core.tasks|' || count(*) from core.tasks union all select 'core.workflow_task_templates|' || count(*) from core.workflow_task_templates" \
    > "$OUT_DIR/rehearse-after.txt"
  local legacy_cols legacy_tables nullable fn
  legacy_cols="$(scratch_psql -c "select count(*) from information_schema.columns where table_schema = 'core' and ((table_name = 'tasks' and column_name = 'phase') or (table_name = 'workflow_task_templates' and column_name = 'phase') or (table_name = 'projects' and column_name in ('phase', 'phases')) or (table_name = 'workspace_group_mappings' and column_name = 'area_id'))")"
  legacy_tables="$(scratch_psql -c "select count(*) from (values ('core.areas'), ('core.area_members'), ('core.area_workflows')) v(t) where to_regclass(v.t) is not null")"
  nullable="$(scratch_psql -c "select is_nullable from information_schema.columns where table_schema = 'core' and table_name = 'workflow_task_templates' and column_name = 'phase_id'")"
  fn="$(scratch_psql -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'core' and p.proname = 'flow_name_key'")"
  {
    echo "### 0025 rehearsal on a restored copy of production"
    echo "- image: \`$image\`"
    echo "- migrations applied: $before → $after"
    echo "- legacy columns left (tasks.phase, workflow_task_templates.phase, projects.phase/phases, workspace_group_mappings.area_id): $legacy_cols"
    echo "- área tables left: $legacy_tables"
    echo "- workflow_task_templates.phase_id nullable: $nullable"
    echo "- core.flow_name_key left: $fn"
    echo "- row counts before → after:"
    paste -d'|' "$OUT_DIR/rehearse-before.txt" "$OUT_DIR/rehearse-after.txt" \
      | awk -F'|' '{ printf "  - %s: %s → %s\n", $1, $2, $4 }'
  } | tee "$OUT_DIR/rehearse.md"
  [ "$after" -gt "$before" ] || die "no migration was applied; is $NEW_IMAGE_TAG the release that ships 0025?"
  [ "$legacy_cols" = "0" ] && [ "$legacy_tables" = "0" ] && [ "$nullable" = "NO" ] && [ "$fn" = "0" ] \
    || die "0025 did not leave the expected schema"
  cmp -s "$OUT_DIR/rehearse-before.txt" "$OUT_DIR/rehearse-after.txt" || die "row counts changed during the rehearsal"
}

step_cleanup() {
  log "cleanup: removing $SCRATCH_NAME and $SCRATCH_NET"
  docker rm -f "$SCRATCH_NAME" >/dev/null 2>&1 || true
  docker network rm "$SCRATCH_NET" >/dev/null 2>&1 || true
  rm -f "$SCRATCH_PW_FILE"
}

case "$STEP" in
  backup) step_backup ;;
  restore) step_restore ;;
  check) step_check ;;
  report) step_report ;;
  rehearse) step_rehearse ;;
  cleanup) step_cleanup ;;
  all)
    trap step_cleanup EXIT
    step_backup
    step_restore
    step_check
    step_report
    step_rehearse
    log "all checks passed; outputs in $OUT_DIR"
    ;;
esac
