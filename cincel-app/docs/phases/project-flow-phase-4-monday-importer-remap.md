# Project Flow Phase 4: monday Importer + Reacomodar Importación

## Goal
The monday importer maps every group to Tramo / Fase / Espacio / Proyecto aparte / Tareas de administración / Ignorar with a saved firm-wide status map, and the already imported projects (Madrid 22, Guadalajara 83, Local Espiropapa) are re-sorted onto tramos and fases, by a one-time run and by the admin action "Reacomodar importación".

## Deliverables

### Backend
- [ ] `scripts/monday/mapping.schema.ts`: `Mapping.version` 2, six-kind `GroupTarget`, `ColumnTarget` + `closed_date`, `StatusMapEntry` / `MondayStatusMap`, `statusLabelKey`, `upgradeMappingV1(raw, lookups, exportData)`; `BoardMapping` without `areaId`, `taskAreaSource`, `taskAreas`, `statusMaps` (BE §10 intro, §10.1)
- [ ] Group targets (`scripts/monday/group-targets.ts`, `lib/monday-import/group-targets.ts`): kinds per strategy, `resolveGroupTarget` defaults by `nameKey`, `groupPlacement`, encode/decode, `pruneGroupTargets`; `workflowPhaseNames` deleted (BE §10.2)
- [ ] `translate.ts`: fase resolution order (template → group fase → title → `PHASE_UNRESOLVED`), espacio, admin groups (`ADMIN_ASSIGNEE_CLEARED`), optional client with the `assign_client` task (`CLIENT_MISSING`), status map with priority and defaults, Timeline → commitment + delivery, `closed_date` → `closedAt`, `stripMondayNumbering`, project tramos / current tramo; áreas removed (BE §10.3)
- [ ] `plan.ts`: new codes (`PHASE_UNRESOLVED`, `CLIENT_MISSING`, `ADMIN_ASSIGNEE_CLEARED`, `TRAMO_MISSING`, `PROJECT_NAME_TAKEN`), área checks removed, already imported items raise no issues (sets computed before translate issues), `PlanIssue.group`, grouped markdown (BE §10.4)
- [ ] `apply.ts`: nullable client, `origin = 'monday'`, stage rows per tramo, `phase_id` / `space_id` (`findOrCreateSpace`, ref `project_space`) / `kind` / `closed_at` / cleaned title, no área creation, `refreshStageClosed`, v2 mapping with status-map snapshot (BE §10.5)
- [ ] `init.ts`: v2 drafts, `closed_date` column detection, lookups with fases / templates / saved status map (BE §10.6)
- [ ] `lib/monday-import/*`: new `MondayImportChoices`, `saveStatusMap`, `suggestPosition`, board-card problems ("Elige un tramo.", "{n} tareas sin fase."), preview samples and issue grouping; `task-areas.ts` (+test) deleted (BE §10.7, §10.8)
- [ ] Rollback: `project_space` step after task refs and before project refs; admin tasks, staff positions, start batches handled (BE §10.9)
- [ ] `scripts/monday/remap.ts` (`loadRemapState` with `EXPORT_MISSING` pre-flight, `planRemap`, `applyRemap`) + `npm run monday -- remap --projects … [--target …] [--apply --by …]` (BE §11.1, §11.2)
- [ ] Actions: `getMondayImportChoicesAction` (new shape), `saveMondayStatusMapAction` (`STATUS_NOT_FOUND`), `createMondayStaffAction` with `positionIds`, `suggestMondayPositionAction`, `getMondayRemapAction` (`NOT_IMPORTED`), `previewMondayRemapAction`, `applyMondayRemapAction`; wizard admin guard; `ProjectDetail.mondayImport` for admins (BE §7.8, §8.5)
- [ ] Vitest: group-target defaults and round trip, `upgradeMappingV1` per old kind + status-map merge, translate rules, plan dedupe on a re-run of the same export, `PROJECT_NAME_TAKEN`, `TRAMO_MISSING`, puesto suggestion scoring, Madrid 22 remap fixture (210 tasks before/after, re-apply no-op, rollback still works), `monday-import-actions.test.ts` for the new actions (BE §16)

### Frontend
- [ ] `GroupTargetsTable`: exactly the six targets, defaults, header "Grupo de monday · En Cincel" (FE §4.6 item 1)
- [ ] `EquivalenciasStep`: "Grupos y tramo" with one "Tramo del tablero" select; `TaskAreaWorkflowSection` deleted; "Tareas de plantilla" with "Tramo · Fase" and "Sin fase · revisar"; "Cliente (opcional)" and client blockers removed (FE §4.6 items 2–4)
- [ ] `StatusMapTable` (new) in `EquivalenciasStep` and `BoardMappingSheet`: defaults with priority, debounced save, "Guardado" / "Guardando…", error + retry; per-board Estatus section removed; "Crear estatus" gains "Cuenta como completada" (FE §4.6 item 5)
- [ ] Column targets "Línea de tiempo → compromiso y entrega" and "Fecha que finalizó" (FE §4.6 item 6)
- [ ] `CreateStaffButton` popover with suggested puesto and reason, in `PeopleStep` and Vista previa (FE §4.6 item 8)
- [ ] `PreviewStep`: warnings grouped by code with counts, `PROJECT_NAME_TAKEN` title, new sample details (FE §4.6 items 7, 9)
- [ ] `RemapImportSheet` (new) from the ficha header ("Reacomodar importación", admins, imported projects): per-board tramo + `GroupTargetsTable`, Vista previa counts and samples, Aplicar with `AlertDialog`, missing-board and export-gone states (FE §3.5, §4.6 item 10)
- [ ] Vitest component tests of FE §15 for the monday wizard and `RemapImportSheet`

### Infrastructure
- [ ] Ops, after this phase is deployed: `npm run monday -- remap --projects "Madrid 22,Guadalajara 83,Local Espiropapa"` pre-flight (every board `source != null`), then `--apply --by <admin email>` with `--target "Obra=tramo:construccion"` for Madrid 22; `npm run flow:report > report.md`; previews and report recorded on the phase issue (BE §4 Ops, §11.2)
- [ ] The four pending monday boards planned (local wizard or `npm run monday -- plan`) and the grouped warning counts recorded on the issue

## Done Definition
- The four pending monday boards plan with zero área and status warnings (status map saved), every group mapped to one of the six targets, and no warnings for already imported items (BE §17.6)
- A second import reuses the saved status map without asking again
- After the one-time remap, Madrid 22 has tramos Presale → Diseño → Construcción (current) and still 210 tasks; Guadalajara 83 and Local Espiropapa re-sorted; the outputs are on the issue (BE §17.7)
- "Reacomodar importación" on an imported project previews, applies, and re-applying the same targets changes nothing; rollback of a batch still works after a remap
- Vitest green in the existing CI

## Parallel work
- BE: mapping schema + group targets first (contract for the wizard), then translate/plan/apply ∥ remap core + CLI
- FE: `GroupTargetsTable` / `EquivalenciasStep` / `StatusMapTable` ∥ `PreviewStep` / `CreateStaffButton` ∥ `RemapImportSheet` (after the remap actions exist)
- Whole phase can run alongside Phase 3 (BE) once Phase 1 is deployed

## Phase dependencies
- Requires: Project Flow Phase 1 deployed (catalog, `findOrCreateSpace`, `startTramo`, positions, `stripMondayNumbering`); Phase 2 merged (fase catalog in the UI); Phase 3 merged before the ops remap and before importing client-less boards (admin tasks, `assign_client`, admin-only visibility)
- Unblocks: Phase 5 (the remap must be done and recorded before the drops)

## Complexity
- Backend: XL
- Frontend: L
- Infra: S

## Risks
- Stored monday exports may be gone from the volume (`EXPORT_MISSING`); the Phase 1 check should catch it early, otherwise re-export before the ops run
- `upgradeMappingV1` on past batches depends on the stored export's status label settings; label ids the export doesn't define are skipped and reported
- Remap moves tasks between projects ("Proyecto aparte") and changes kinds; the change check and rollback must keep working (covered by the fixture test)
