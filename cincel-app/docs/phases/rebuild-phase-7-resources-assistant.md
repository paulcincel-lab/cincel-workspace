# Rebuild Phase 7: Resources and Assistant

Milestone de GitHub: **Rebuild M7 — Resources and Assistant**

Fuente: plan de reconstrucción (Parte A, Fase 7). Backend en `lib/repositories/resources-repository.ts` y `lib/actions/resources-actions.ts` (`core.resource_links`, `core.drive_files`). El asistente (`lib/assistant/tools.ts`, `app/api/asistente/chat/route.ts`) sigue apuntando a las tablas viejas y debe reescribirse contra la capa de Fase 2.

## Goal
Secciones de recursos sobre el modelo nuevo; cada herramienta del asistente reescrita para pasar por la capa de la Fase 2 (repositorios + acciones), no por Drizzle directo a tablas que ya no existen.

## Deliverables

### Backend
- [ ] Ninguno nuevo para recursos -- `fetchResourceLinksAction`, `createResourceLinkAction`, `updateResourceLinkAction`, `deleteResourceLinkAction` ya existen
- [ ] Reescribir cada tool de `lib/assistant/tools.ts` para usar `lib/actions/*` en vez de importar tablas de `lib/db/schema` directamente (hoy referencia `activities`, `teamMembers`, `projects.active/stage` que ya no existen)
- [ ] Revisar `app/api/asistente/chat/route.ts` por cualquier acceso directo a las tablas viejas

### Frontend
- [ ] `/recursos`: secciones (mis-documentos, mis-favoritos, plantillas-diseño, formatos-obra, mis-vacaciones, formación, empresa) sobre `ResourceLink` nuevo -- reemplaza `ResourcesWorkspace.tsx` / `ResourcesWorkspaceServer.tsx`
- [ ] Picker de Google Drive integrado con `upsertDriveFile` para poblar `resourceLinks.driveFileId`
- [ ] Sin cambios visibles en el chat del asistente; validar manualmente cada intención (crear tarea, reasignar, crear cliente, fusionar duplicados, etc.) contra el nuevo modelo

### Infrastructure
- [ ] Ninguno

## Done Definition
- Cada sección de recursos lista, crea, edita y borra correctamente sobre `core.resource_links`
- Cada tool del asistente ejecuta contra el modelo nuevo sin importar tablas eliminadas
- `npm run test:unit` verde, incluyendo `lib/assistant/tools.test.ts` y `lib/assistant/prompt.test.ts` actualizados
- `npx tsc --noEmit` sin errores en `app/recursos`, `components/recursos` y `lib/assistant`

## Parallel work
- FE de recursos y reescritura del asistente son independientes entre sí

## Phase dependencies
- Requires: Rebuild Phase 3 (staff, para favoritos/personal_for), Rebuild Phase 6 (tareas, para las tools de crear/reasignar tarea)

## Complexity
- Backend: M
- Frontend: M
- Infra: XS

## Risks
- Las herramientas del asistente que buscan por nombre/descripcion (fuzzy match) deben adaptarse a los nuevos campos (`tasks.title` en vez de `activities.description`, ids uuid en vez de legacy numérico); revisar cada tool una por una
