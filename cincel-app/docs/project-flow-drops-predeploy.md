# Project flow drops release: pre-deploy checks

Migration `0025_project_flow_drops.sql` drops `tasks.phase`,
`workflow_task_templates.phase`, `projects.phase`, `projects.phases`, the área
tables and `core.flow_name_key`. After it runs, the only rollback is a restore
of the backup taken right before the deploy (ADR 0003,
`docs/phases/project-flow-phase-5-cleanup-release.md` → Infrastructure, Risks).

`scripts/ops/drops-predeploy.sh` runs every check on the production host. It
never writes to production: it only reads it (`pg_dump`, `select`,
`flow:report`). The rehearsal runs on a scratch copy with no host port.

## Before you start

- The release that ships 0025 is published (its `cincel-app-migrate:<tag>`
  image is in the registry). Note the tag: `NEW_IMAGE_TAG`.
- Pick a quiet window and tell the team Cincel is down for the deploy.
- Disk: room for one dump plus a second Postgres with a full copy.

## Run

```bash
ssh <prod-host>
cd ~/apps/cincel-workspace/cincel-app          # production compose folder
set -a; . ./.env; set +a                        # REGISTRY_URL, IMAGE_TAG, POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml stop app   # nothing writes after the backup
export OUT_DIR=~/cincel-predeploy-0025/$(date -u +%Y%m%dT%H%M%SZ)
NEW_IMAGE_TAG=<release tag> scripts/ops/drops-predeploy.sh all
```

`all` runs `backup`, `restore`, `check`, `report`, `rehearse`, then removes
the scratch copy. It stops at the first failure. Each step can also run alone
(same `OUT_DIR` exported for all of them; `cleanup` last).

| Step | What it does | Must show |
|---|---|---|
| `backup` | `pg_dump -Fc` of production to `~/cincel-backups/cincel-before-0025-<ts>.dump` + `.sha256` | non-empty dump |
| `restore` | checksum, `pg_restore --single-transaction --exit-on-error` into a scratch `postgres:17-alpine`, exact row count of every table vs production | every table matches |
| `check` | `select count(*) from core.workflow_task_templates where phase_id is null` on production | `0` |
| `report` | `npm run flow:report` against production with the deployed migrate image (`REPORT_IMAGE_TAG` overrides the tag) | saved to `flow-report.md` |
| `rehearse` | `npm run db:migrate` with `cincel-app-migrate:$NEW_IMAGE_TAG` on the scratch copy | migrations applied, no legacy columns or área tables, `phase_id` not null, `flow_name_key` gone, row counts unchanged |

If `check` is not 0: open Configuración → Tramos y fases, give those templates
a fase, and run the script again. Do not deploy.

## Record on the release issue

One comment per acceptance item, pasted from `$OUT_DIR`:

1. `backup.md` + `restore.md`: backup taken and restore verified.
2. `check.md`: null `phase_id` count is 0.
3. `flow-report.md`: final migration report.
4. `rehearse.md`: 0025 applied on a copy of production.

Do not paste `run.log`, `row-counts.diff` or the dump: they can contain client
data. Keep the dump in `~/cincel-backups` until the release has been stable
for at least a week.

## Deploy

```bash
IMAGE_TAG=<release tag> docker compose -f docker-compose.prod.yml up -d
```

The `migrate` service applies 0025, then `app` starts.

## Rollback (after 0025)

```bash
docker compose -f docker-compose.prod.yml stop app
DB=$(docker compose -f docker-compose.prod.yml ps -q db)
docker exec -i "$DB" psql -U cincel -d postgres -c 'drop database cincel with (force)' -c 'create database cincel owner cincel'
docker exec -i "$DB" pg_restore -U cincel -d cincel --no-owner --single-transaction --exit-on-error \
  < ~/cincel-backups/cincel-before-0025-<ts>.dump
IMAGE_TAG=<previous tag> docker compose -f docker-compose.prod.yml up -d
```

Anything written between the backup and the rollback is lost.
