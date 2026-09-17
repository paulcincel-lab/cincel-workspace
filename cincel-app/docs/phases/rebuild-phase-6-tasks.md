# Rebuild Phase 6: Tasks

Milestone de GitHub: **Rebuild M6 — Tasks**

Fuente: plan de reconstrucción (Parte A, Fase 6), la más grande. Backend en `lib/repositories/tasks-repository.ts` y `lib/actions/tasks-actions.ts` (`core.tasks`, `core.task_support`, `core.task_checklist_items`, `core.history_events`).

## Goal
Creación de tareas de usuario, asignación con staff sugerido por área, ficha con acciones de ciclo de vida, checklist, comentarios e historial, tablero, calendario, mis-tareas, archivo.

## Deliverables

### Backend
- [ ] Ninguno nuevo -- `createUserTaskAction`, `updateTaskAction`, `setTaskStatusAction`, `assignTaskAction`, `archiveTaskAction`, `deleteTaskAction`, `setTaskSupportAction`, checklist (`add`/`update`/`remove`/`reorder`), `addTaskCommentAction`, `fetchTaskHistoryAction`, `fetchBoardAction`, `fetchCalendarAction`, `fetchMyTasksAction` ya existen

### Frontend
- [ ] `/tareas` (o la ruta que reemplace `/actividades/[departamento]`): lista de tareas por workflow/proyecto usando `TaskListItem`
- [ ] Alta de tarea de usuario: proyecto obligatorio, etapa opcional, prioridad, fechas (commitment/review/delivery) -- reemplaza `ActividadesClient.tsx`
- [ ] Asignación: al elegir workflow, sugerir primero el staff de las áreas que lo poseen (`fetchAssignableStaffAction` ya devuelve `suggested`)
- [ ] Ficha de tarea: cambio de estatus, reasignación, staff de apoyo (`setTaskSupportAction`), checklist con reordenar, comentarios (bitácora, nunca se borra) e historial de cambios (`fetchTaskHistoryAction`)
- [ ] Tablero (`/tablero`): columnas por estatus sobre `fetchBoardAction`, drag-and-drop dispara `setTaskStatusAction`
- [ ] Calendario (`/calendario`): rango de fechas sobre `fetchCalendarAction`
- [ ] Mis tareas: `fetchMyTasksAction` para el usuario en sesión (manager o apoyo)
- [ ] Archivo: filtro de tareas archivadas, acción de archivar/desarchivar

### Infrastructure
- [ ] Ninguno

## Done Definition
- Una tarea de usuario se puede crear, asignar, mover de estatus, comentar y checklistear de punta a punta
- El tablero y el calendario reflejan los mismos datos que la lista (misma fuente, `tasksRepository`)
- El historial nunca pierde una entrada al editar la tarea (verificar contra `AGENTS.md`: "Nunca eliminar historial")
- `npm run test:unit` verde; `npm run test:e2e` cubre al menos: crear tarea, cambiar estatus, comentar
- `npx tsc --noEmit` sin errores en `app/tareas`, `app/tablero`, `app/calendario` y componentes relacionados

## Parallel work
- FE: tablero y calendario pueden construirse en paralelo a la ficha de tarea una vez que la lista base existe
- Rebuild Phase 7 (rendimiento de tablero/calendario) es hardening posterior, no bloquea esta fase

## Phase dependencies
- Requires: Rebuild Phase 3 (staff pickers), Rebuild Phase 5 (selector de proyecto/etapa)

## Complexity
- Backend: XS
- Frontend: XL
- Infra: XS

## Risks
- Es la fase más grande del plan; conviene partirla en varios issues (lista, alta, ficha, tablero, calendario, mis-tareas, archivo) en vez de uno solo
- El drag-and-drop del tablero debe llamar `setTaskStatusAction` y no mutar estado local antes de confirmar contra el servidor, o puede desincronizarse
