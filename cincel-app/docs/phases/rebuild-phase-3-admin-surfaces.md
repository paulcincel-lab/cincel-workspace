# Rebuild Phase 3: Admin Surfaces

Milestone de GitHub: **Rebuild M3 — Admin Surfaces**

Fuente: plan de reconstrucción (Parte A, Fase 3) sobre el modelo nuevo (`core.staff`, `core.staff_profiles`, `core.areas`, `core.area_members`, `core.workflows`, `core.workflow_task_templates`, `core.area_workflows`, `core.auth_credentials`). Backend ya construido en `lib/repositories/{staff,areas,workflows,auth}-repository.ts` y `lib/actions/{staff,areas,workflows}-actions.ts`.

## Goal
Construir las pantallas de administración -- equipo/perfiles, áreas con miembros y workflows asignados, editor de workflows y plantillas, gestión de login -- porque todo lo que sigue (Fases 4-6) necesita selectores de staff y workflows ya funcionando.

## Deliverables

### Backend
- [ ] Verificar que las capacidades de `resolveTeamCapabilities` cubren las acciones nuevas de perfil/áreas; si falta alguna, agregarla en `lib/auth/permissions.ts` (no reinventar el resolver)
- [ ] Agregar capacidades propias para `areas` y `workflows` en `lib/auth/permissions.ts` (hoy gated a "Administrador" a secas en `lib/actions/areas-actions.ts` / `workflows-actions.ts`); reemplazar ese gate temporal por el resolver real
- [ ] Endpoint/acción para exportar staff (reusar `lib/utils/export-service.ts` si aplica)

### Frontend
- [ ] `/equipo`: listar `core.staff` vía `fetchStaffAction`, crear/editar con `createStaffAction`/`updateStaffAction`, activar/desactivar, borrar (soft delete)
- [ ] Drawer de perfil HR (`staffProfiles`) reusando el patrón de drawers existente; solo visible con el capability correcto (PII)
- [ ] Selector de áreas por staff (`setStaffAreasAction`) -- multi-select, no texto libre
- [ ] Gestión de login: alta de contraseña temporal / activar-desactivar acceso (`setStaffCredentialAction`) -- reemplaza el flujo legado de `team-actions.ts`
- [ ] Nueva vista `/configuracion/areas`: lista de áreas, miembros (`setAreaMembersAction`), workflows asignados (`setAreaWorkflowsAction`), alta/edición/baja de área
- [ ] Nueva vista `/configuracion/workflows`: lista de los 4 workflows, editor de plantillas por workflow (alta, edición, reordenar, desactivar) -- usa `createTemplateAction`/`updateTemplateAction`/`reorderTemplatesAction`/`deactivateTemplateAction`
- [ ] Reemplazar todo consumo de `lib/data/team.ts` / `team-public.ts` como fuente de datos por las acciones reales; el mock queda solo como fallback de primer render si aplica

### Infrastructure
- [ ] Ninguno

## Done Definition
- Un administrador puede crear un colaborador, asignarle área(s), darle acceso y ver su perfil HR
- Un administrador puede crear/editar un área, asignarle miembros y workflows
- Un administrador puede crear/editar plantillas de un workflow y reordenarlas
- `npm run test:unit` verde
- `npx tsc --noEmit` sin errores en `app/equipo`, `app/configuracion/areas`, `app/configuracion/workflows` y sus componentes

## Parallel work
- FE: equipo y áreas pueden avanzar en paralelo; workflows depende de que áreas exista para el picker de "qué área lo posee"

## Phase dependencies
- Requires: Rebuild Phase 2 (data access + auth) -- ya mergeado en `rebuild`

## Complexity
- Backend: S
- Frontend: L
- Infra: XS

## Risks
- El gate temporal por rol "Administrador" en `areas-actions.ts`/`workflows-actions.ts` debe reemplazarse por capacidades reales antes de dar por cerrada la fase, o el módulo de permisos queda inconsistente con el resto de la app
