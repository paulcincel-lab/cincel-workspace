# Project flow release A: dry run and post-deploy report

Release A ships `0023_project_flow_schema.sql` and `0024_project_flow_backfill.sql`.
Both run unattended on deploy (the `migrate` service, one migrator
transaction), so 0024 is checked on a copy of production before the PR merges,
and its report is read on production right after the deploy.

Spec: `docs/phases/project-flow-phase-1-schema-seed-backfill.md` (Done
Definition, Risks), `docs/specs/project-flow/backend.md` §4 and §4.4.

In the commands below `<prod-host>` is the production server's SSH host and
`<compose-dir>` the folder that holds `docker-compose.prod.yml` and its `.env`
there. Replace them.

---

## 1. Before merge: dry run on a production copy

Runs on the operator's machine, never on the production server and never
against the production database. The copy holds client data: keep it on an
encrypted disk and delete it when done (step 1.6).

### 1.1 Dump production (read only)

```bash
ssh <prod-host> "cd <compose-dir> && docker compose -f docker-compose.prod.yml exec -T db \
  sh -c 'pg_dump -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --format=custom --no-owner --no-acl'" \
  > cincel-prod-$(date -u +%Y%m%dT%H%M%SZ).dump
```

### 1.2 Restore into a throwaway local database

```bash
docker run -d --name cincel-flow-dryrun -e POSTGRES_PASSWORD=dryrun -p 55432:5432 postgres:17-alpine
sleep 5
docker exec cincel-flow-dryrun createdb -U postgres cincel
docker exec -i cincel-flow-dryrun pg_restore -U postgres -d cincel --no-owner --no-acl < cincel-prod-*.dump
export DATABASE_URL=postgres://postgres:dryrun@localhost:55432/cincel
```

`DATABASE_URL` now points at the local copy. Check it before every command
below (`echo $DATABASE_URL`).

### 1.3 Apply 0023 + 0024 the way the deploy does

From a checkout of the release A branch:

```bash
cd cincel-app
npm ci
npm run db:migrate          # the migrate service's command
```

It must exit 0. A failure here is exactly what would block the production
deploy: record the error on the issue and fix 0024 before merging.

### 1.4 Run the checks

```bash
psql "$DATABASE_URL" -X -q -f scripts/project-flow-dry-run-checks.sql
npm run flow:report > flow-report-dryrun.md
```

Every row of the first table must have `ok = t`:

| Check | Expected |
|---|---|
| fases (live tramos) | 14 |
| templates (live tramos) | 51 |
| templates without `phase_id` | 0 |
| live «Cancelado» / «En espera» | 1 each |
| `group_mapping_kind` | `role,position` |
| live active/paused projects sharing `lower(name)` | 0 |
| `projects_name_lower_uq` exists, `projects_client_name_lower_uq` dropped | 1 / 0 |
| tasks whose fase belongs to another tramo | 0 |

`flow:report` must list the unmatched fases (`task_phase_unmatched`), the old
`projects.phases` values, the áreas and the removed group mappings.

### 1.5 Record the result

Comment on the release issue (#760) with: the dump timestamp, the commit
checked, the `npm run db:migrate` exit status, the checks output and
`flow-report-dryrun.md`. Strip anything that is client data and not needed to
judge the result (the report lists project names; keep the counts and kinds if
the comment is visible to people outside the team).

### 1.6 Clean up

```bash
docker rm -f cincel-flow-dryrun
shred -u cincel-prod-*.dump flow-report-dryrun.md
unset DATABASE_URL
```

---

## 2. After deploy: report on production

Take a backup before deploying (ADR 0003): the step 1.1 dump, kept until
release B ships.

The deploy runs 0023 + 0024 by itself. Then, on the server, read the report
with the `migrate` image (it has `tsx` and `scripts/`; the `app` image does
not). Read only:

```bash
ssh <prod-host> "cd <compose-dir> && docker compose -f docker-compose.prod.yml run --rm --no-deps migrate npm run --silent flow:report" \
  > flow-report-prod.md
```

Post `flow-report-prod.md` as a comment on #760. If a `status_reused` row has
`tasksReopened` > 0, tell the team which tasks went back to open. Hand the
`task_phase_unmatched` rows to the tramo leads and the `project_without_tramo`,
`project_renamed_duplicate`, `template_phase_defaulted`, `area*` and
`group_mapping_area_removed` rows to the administrator (backend spec §4.4).

---

## 3. Screens

On the local copy (`npm run dev` with the step 1.2 `DATABASE_URL`) before
merge, and on production after deploy. For the local run, leave the Google
service account, SMTP and monday variables unset in `.env.local`, so the copy
never writes to Drive or sends mail to real clients:

- [ ] Actividades: lists, filters and task detail open; fases show (or «Sin fase · revisar»).
- [ ] Proyectos: list and create; a duplicate name shows the name-taken error.
- [ ] Ficha de proyecto: tramos, tasks and cronograma load.
- [ ] Equipo: staff list and staff detail.
- [ ] Configuración: every tab loads.
- [ ] Staff Google sign-in: a staff account whose access comes from a Google
      group still signs in with the right role.
- [ ] Complete a task, then reopen it: `closed_at` is cleared. Check with

      ```sql
      select id, status, closed_at from core.tasks where id = '<task id>';
      ```

Tick these in the #760 comment.
