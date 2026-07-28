# Reglas de integridad Sprint 11.1

## Reglas generales
1. Todas las tablas usan UUID como PK.
2. Soft delete estandar: `deleted_at` NULL = activo.
3. `updated_at` se actualiza automatico via trigger.
4. `legacy_id` se usa para trazabilidad de datos existentes de localStorage.

## Integridad por dominio

### Clientes y proyectos
1. `projects.client_id` debe existir en `clients.id`.
2. `projects.code` debe ser unico por registro activo.
3. `projects.progress` debe estar entre 0 y 100.

### Proyecto y equipo
1. `project_members.project_id` debe existir en `projects.id`.
2. Si `project_members.team_member_id` existe, debe apuntar a `team_members.id`.
3. Se evita duplicado del mismo miembro en el mismo proyecto (`project_id`, `team_member_id`).

### Actividades
1. `activities.project_id` debe existir en `projects.id`.
2. `activities.workflow` restringido a: Presale, Diseno, Construccion.
3. `activities.status` restringido a: Pendiente, En proceso, Completado, Bloqueado.
4. `activities.priority` restringido a: Alta, Media, Baja.
5. Si existe `activities.manager_member_id`, debe existir en `team_members.id`.

### Soportes, historial y checklist
1. `activity_support_members.activity_id` debe existir en `activities.id`.
2. `activity_history.activity_id` debe existir en `activities.id`.
3. `activity_checklist_items.activity_id` debe existir en `activities.id`.
4. `activity_checklist_items` mantiene orden por `sort_order`.

### Proveedores
1. `contractor_categories.contractor_id` debe existir en `contractors.id`.
2. `collaborator_categories.collaborator_id` debe existir en `collaborator_providers.id`.
3. `collaborator_skills.collaborator_id` debe existir en `collaborator_providers.id`.
4. `store_categories.store_id` debe existir en `stores.id`.

## RLS inicial
1. Todas las tablas del modelo activan RLS.
2. Politica inicial: lectura/escritura para rol autenticado.
3. Sin acceso para anon.
4. Politicas finas por modulo/rol se refinan en 11.2/11.3.

## Validaciones minimas recomendadas (pre 11.2)
1. No orfandad de FK.
2. Unicidad de codigos de proyecto.
3. Fechas validas en actividades.
4. Valores de enum dentro de catalogo permitido.
