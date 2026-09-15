# Rebuild Phase 5: Projects

Milestone de GitHub: **Rebuild M5 — Projects**

Fuente: plan de reconstrucción (Parte A, Fase 5). Backend en `lib/repositories/projects-repository.ts` y `lib/actions/projects-actions.ts` (`core.projects`, `core.project_members`, `core.project_contacts`, `core.project_links`, apply-workflow).

## Goal
Alta de proyecto con cliente y etapa obligatorios, ficha, miembros, socios y proveedores, links de Drive por propósito, y aplicar-workflow con preview de crear/omitir.

## Deliverables

### Backend
- [ ] Ninguno nuevo -- `createProjectAction`, `updateProjectAction`, `setProjectStageAction`, `setProjectMembersAction`, `setProjectContactsAction`, `setProjectLinkAction`, `previewApplyWorkflowAction`, `applyWorkflowAction` ya existen

### Frontend
- [ ] `/proyectos`: lista sobre `ProjectListItem` (cliente, etapa, manager/coordinador, conteo de tareas) -- reemplaza `use-projects-data.ts` legado
- [ ] Alta de proyecto: cliente (`contactsRepository`, solo tipo `cliente`) y etapa (workflow) obligatorios, como exige la Regla 1 del modelo
- [ ] Ficha de proyecto (`/proyectos/[id]/ficha`): datos generales, miembros (`setProjectMembersAction`), socios/proveedores (`setProjectContactsAction`), links por propósito (administrativo, planos, renders, reportes) vía `setProjectLinkAction`
- [ ] Selector de picker de Drive integrado con `upsertDriveFile` / `DriveFileInput` para poblar `project_links.drive_file_id`
- [ ] UI de "aplicar workflow": mostrar preview (`previewApplyWorkflowAction`, listas `create` / `skip`) antes de confirmar, luego `applyWorkflowAction`
- [ ] Cambio de etapa (`setProjectStageAction`) como acción explícita, no un campo de formulario libre
- [ ] Archivar/cancelar proyecto (`archiveProjectAction`) y borrar (soft delete, `deleteProjectAction`)

### Infrastructure
- [ ] Ninguno

## Done Definition
- No se puede crear un proyecto sin cliente ni sin etapa (bloqueado en UI, reforzado por el modelo)
- Aplicar un workflow muestra qué tareas se crearán y cuáles ya existen antes de confirmar
- Reaplicar el mismo workflow no duplica tareas
- `npm run test:unit` verde; `npx tsc --noEmit` sin errores en `app/proyectos` y componentes relacionados

## Parallel work
- FE: ficha (miembros/contactos/links) puede avanzar en paralelo a lista + alta
- Requiere Rebuild Phase 4 (CRM) para el selector de cliente y Rebuild Phase 3 para el selector de staff/manager

## Phase dependencies
- Requires: Rebuild Phase 3 (staff pickers), Rebuild Phase 4 (selector de cliente)

## Complexity
- Backend: XS
- Frontend: L
- Infra: XS

## Risks
- El preview de aplicar-workflow debe reflejar exactamente lo que la base de datos hará (partial unique en `tasks (project_id, template_id)`); si el preview se calcula distinto al insert real puede mostrar conteos incorrectos
