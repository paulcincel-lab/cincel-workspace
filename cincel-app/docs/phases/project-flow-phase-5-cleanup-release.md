# Project Flow Phase 5: Cleanup Release (Drops)

## Goal
A separate release drops the legacy columns and áreas tables (0025) and deletes every legacy code path, so the old model can't come back.

## Deliverables

### Backend
- [ ] `0025_project_flow_drops.sql` (BE §4.3): re-snapshot report rows (0024 steps 5d, 6, 12, `on conflict do nothing`); `workflow_task_templates.phase_id SET NOT NULL`; drop `tasks.phase`, `workflow_task_templates.phase`, `projects.phase`, `projects.phases`; drop `area_workflows`, `area_members`, `areas`, then `workspace_group_mappings.area_id`; drop `core.flow_name_key`; `history_entity` keeps `'area'`
- [ ] Schema: remove the `@deprecated` declarations and the `areas` relations / tables from `lib/db/schema/*`
- [ ] Delete `lib/actions/areas-actions.ts`, `lib/repositories/areas-repository.ts` and any remaining área readers (BE §2, §15)
- [ ] `scripts/monday/rollback.ts`: remove the `area` entity (old `area` refs become ref-only deletes) (BE §4.3)
- [ ] Remove the `areas` → `positions` permission alias in the client reader (BE §4.2 step 15, §4.3)
- [ ] Catalog drift guard: `legacyTitle` check frozen as a fixture before the TS templates are deleted (BE §16)
- [ ] DB test: 0025 on top of the 0024 dev-like fixture (BE §16)

### Frontend
- [ ] Delete `lib/actividades/departamento.ts` (`DEPARTMENTOS`), `lib/templates/{presale,diseno,operativas}.ts`, `components/tareas/NewProjectTemplateModal.tsx`, `lib/proyectos/phases.ts` (+test) (FE §4.3, §12)
- [ ] Delete `app/configuracion/areas/AreasClient.tsx`, `components/configuracion/AreaEditorDrawer.tsx` (+test), `app/configuracion/workflows/WorkflowsClient.tsx`; the two `page.tsx` redirect stubs stay (FE §2, §4.4)
- [ ] Remove any leftover `Area` / `StaffAreaRef` / `ApplyWorkflowPreview` types and "Sin área" copy (FE §7.1)
- [ ] Full local e2e run (`CI=1 npm run test:e2e`) recorded on the issue; fix any spec still asserting old copy

### Infrastructure
- [ ] Production DB backup taken right before deploying this release (rollback = restore, ADR 0003)
- [ ] Pre-deploy check on production: `select count(*) from core.workflow_task_templates where phase_id is null` = 0; final `npm run flow:report` saved on the issue

## Done Definition
- 0025 applies on a copy of production and on a fresh DB; typecheck, lint and vitest pass in the existing CI
- `rg "areaMembers|areaWorkflows|DEPARTMENTOS|lib/templates|projects\.phases|NewProjectTemplateModal"` finds nothing outside migrations and history; `tasks.phase` and the áreas tables no longer exist (BE §17.5)
- Every screen works after deploy; the final report is on the issue
- Acceptance of the brief §6 re-checked end to end (labels, name-only project, Cobro → Diseño ready, DB-enforced fase, monday boards, Madrid 22)

## Parallel work
- BE (migration + schema + rollback) ∥ FE (file deletions); one release, two PRs

## Phase dependencies
- Requires: Project Flow Phases 1–4 deployed, the Phase 4 one-time remap applied and recorded, and production running on them long enough to confirm nothing reads the old columns
- Unblocks: none

## Complexity
- Backend: S
- Frontend: S
- Infra: S

## Risks
- Destructive: after 0025, rollback is a DB restore from the pre-deploy backup only
- Rows written between Phase 1 and this release (free-text fases, templates) must be captured by the report re-snapshot before the columns go
