# Project flow: one-time remap of the imported projects

One run of this runbook re-sorts the projects imported from monday before the
project flow (Madrid 22, Guadalajara 83, Local Espiropapa) onto tramos, fases,
espacios and administrative tasks. It is the "Ops" step between release A and
release B of `docs/specs/project-flow/backend.md` §4, with the rules of §11.2,
and it must be done and recorded before the Phase 5 drops (0025) ship.

The remap never deletes tasks, comments or history, and re-applying the same
targets changes nothing, so every step below can be repeated.

In the commands below `<prod-host>` is the production server's SSH host and
`oscar@cincel.mx` the admin email recorded as the author of the changes.
Replace them.

---

## 0. Before you start

- Release A (Phase 1 to Phase 4 of the project flow) is deployed: migrations
  0023 and 0024 ran, and the deployed image has `npm run monday -- remap`.
- Project Flow Phase 3 (admin tasks, `assign_client`, admin-only visibility)
  is merged and deployed.
- The operator's checkout is on the same commit as the deployed image, with
  `npm ci` done.
- The env file of the target database exists (`.env.monday.prod`, or
  `.env.monday.staging` for a rehearsal), as in
  `docs/monday-migration-runbook.md` §0.
- The monday exports of the three projects are where their batches say they
  are. The remap reads `import_batches.export_path`, so run it from the
  machine that holds those folders (normally the operator's machine, under
  `exports/`). Check:

  ```sql
  select b.id, b.export_path, b.exported_at
  from core.import_batches b
  where b.id in (
    select r.batch_id from core.import_refs r
    join core.projects p on p.id = r.row_id
    where r.entity = 'project'
      and p.name in ('Madrid 22', 'Guadalajara 83', 'Local Espiropapa')
  );
  ```

Pick a time nobody is working in Cincel and tell the team: apply takes one
transaction per project, a few seconds each.

## 1. Open the tunnel and back up

Open the tunnel exactly as in `docs/monday-migration-runbook.md` §6.1 and keep
that terminal open. Then:

```bash
cd cincel-app
set -a; . ./.env.monday.prod; set +a

# restore point, kept on the server
ssh <prod-host> 'cd ~/apps/cincel-workspace/cincel-app && docker exec $(docker compose -f docker-compose.prod.yml ps -q db) pg_dump -U cincel -d cincel -Fc > ~/cincel-before-flow-remap-$(date +%Y%m%d%H%M).dump'
```

Write down the dump file name.

## 2. Live counts before

```sql
select p.name, count(t.id) as tasks
from core.projects p
left join core.tasks t on t.project_id = p.id and t.deleted_at is null
where p.deleted_at is null
  and p.name in ('Madrid 22', 'Guadalajara 83', 'Local Espiropapa')
group by p.name order by p.name;
```

Madrid 22 must show 210. Keep the output: the totals must match after apply.

## 3. Pre-flight (no `--apply`)

```bash
npm run monday -- remap \
  --projects "Madrid 22,Guadalajara 83,Local Espiropapa" \
  --target "Obra=tramo:construccion" \
  2>&1 | tee remap-preflight.txt
```

The `--target` override only matches the "Obra" group, which only Madrid 22
has; the other two projects use the default targets.

Check before going on:

- Every board of the three projects is listed with a source
  (`source != null`). A board without a source, or `EXPORT_MISSING` (exit
  code non-zero, "Ya no están los archivos de la exportación de monday de
  este proyecto. Vuelve a exportar el tablero para reacomodarlo."), means the
  export is gone: re-export those boards (`npm run monday -- export`,
  `docs/monday-migration-runbook.md` §2), put them back at the batch's
  `export_path`, and run the pre-flight again. Do not apply until every board
  has a source.
- Each preview's total equals the live count of step 2.
- Madrid 22's preview: Presale and Diseño groups → their tramo, Proyecto
  Ejecutivo → Diseño · Ejecutivo, Administrativo → Tareas de administración,
  Obra → tramo Construcción.
- No blocking issue (`PROJECT_NAME_TAKEN`, `TRAMO_MISSING`). Fix the cause in
  the app and repeat the pre-flight.

Post `remap-preflight.txt` as a comment on the remap issue.

## 4. Apply

```bash
npm run monday -- remap \
  --projects "Madrid 22,Guadalajara 83,Local Espiropapa" \
  --target "Obra=tramo:construccion" \
  --apply --by oscar@cincel.mx \
  2>&1 | tee remap-apply.txt
```

Post `remap-apply.txt` as a comment on the remap issue.

## 5. Check

Run the counts of step 2 again: the totals are unchanged (Madrid 22: 210).

Tramos of Madrid 22, in order, and the current one:

```sql
select w.name, w.sort_order, ps.started_at, ps.closed_at,
       (w.id = p.current_workflow_id) as current
from core.projects p
join core.project_stages ps on ps.project_id = p.id
join core.workflows w on w.id = ps.workflow_id
where p.name = 'Madrid 22' and p.deleted_at is null
order by w.sort_order;
```

Expected: Presale, Diseño, Construcción, with Construcción current.

In the app (as an admin), open each of the three projects: the tasks sit
under their tramo and fase, the administrative ones only show for admins,
and the project has the comment "Reacomodar importación: {n} tareas.".

Run the apply of step 4 once more: every project must report 0 changed
tasks. Note it on the issue.

## 6. Migration report

```bash
npm run flow:report > report.md
```

Post `report.md` as a comment on the remap issue. Hand the rows that need
someone (`task_phase_unmatched`, `project_without_tramo`,
`template_phase_defaulted`, `group_mapping_area_removed`, and so on;
`docs/specs/project-flow/backend.md` §4.4) to the people listed there.

## 7. If something is wrong

- A target was wrong: run the remap again with a corrected `--target` (the
  remap re-sorts from the stored export each time; nothing is deleted).
- The data is wrong beyond what a remap can fix: restore the dump of step 1
  (`pg_restore --clean --if-exists -d cincel` inside the `db` container),
  tell the team, and start again from step 2.

Close the tunnel when done. Delete `remap-preflight.txt`, `remap-apply.txt`
and `report.md` from the operator's machine once they are on the issue.
