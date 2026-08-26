# Revisión en profundidad — Modelo de datos y Supabase

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (== `main`, HEAD `d7af1b3`)
Alcance: `supabase/migrations/`, `docs/sprint-11-1/erd.md`, `data-dictionary.md`, `integrity-rules.md`, `backup-checklist.md`.

## Esquema actual (resumen)

Schema Postgres `core`, 6 migraciones idempotentes (`202607270001`–`202607270006`), 17 tablas:

`clients`, `client_contacts`, `team_members`, `projects`, `project_drive_links`, `project_members`, `activities`, `activity_support_members`, `activity_history`, `activity_checklist_items`, `contractors`, `contractor_categories`, `collaborator_providers`, `collaborator_categories`, `collaborator_skills`, `stores`, `store_categories`, y `resource_links` (agregada en la migración 5, Sprint 11.2).

Patrones consistentes en casi todo el esquema:
- PK `uuid default gen_random_uuid()` (excepción: ver hallazgo #1).
- Soft delete uniforme vía `deleted_at timestamptz` en todas las tablas.
- `created_at`/`updated_at` con trigger automático (`core.set_updated_at()`).
- `legacy_id bigint` en tablas migradas desde los mocks de `localStorage`, para trazabilidad.
- Enums nativos de Postgres para dominios cerrados: `client_kind`, `workflow_type`, `task_status`, `task_priority` (migración 1).

## Hallazgos

### 1. [MEDIO] `resource_links` rompe la convención de PK `uuid` del resto del esquema
- Archivo: `supabase/migrations/202607270005_resources_table.sql:4` — `id text primary key` (en vez de `uuid default gen_random_uuid()`).
- `docs/sprint-11-1/integrity-rules.md:4` establece como regla general #1: "Todas las tablas usan UUID como PK" — `resource_links` es la única tabla que no la cumple, y fue agregada después de que se escribiera esa regla (Sprint 11.2 vs. reglas de 11.1).
- No es necesariamente un error (podría ser intencional para IDs legibles/estables de recursos), pero rompe la convención documentada sin que quede explicado en ningún lado por qué.
- **Recomendación**: documentar explícitamente la excepción en `integrity-rules.md`, o migrar a `uuid` por consistencia.

### 2. [MEDIO] Documentación de esquema (ERD / diccionario de datos) desactualizada respecto a las migraciones
- Archivos: `docs/sprint-11-1/erd.md` (276 líneas), `docs/sprint-11-1/data-dictionary.md` (192 líneas) — ninguno de los dos menciona `resource_links`, agregada en `supabase/migrations/202607270005_resources_table.sql` (Sprint 11.2).
- Ambos documentos datan de Sprint 11.1; el esquema real ya avanzó una migración más allá de lo que describen.
- **Recomendación**: regenerar/actualizar ERD y diccionario de datos como parte del checklist de cierre de cada sub-sprint que agregue tablas, no solo al final de un sprint mayor.

### 3. [BAJO, positivo] Integridad referencial y regla de "nunca eliminar historial" están bien soportadas a nivel de esquema
- Todas las FKs (`projects.client_id`, `activities.project_id`, `activity_history.activity_id`, etc.) se declaran sin `ON DELETE CASCADE` — el comportamiento por defecto de Postgres (`NO ACTION`) impide borrar un registro padre mientras existan hijos, y el patrón de soft-delete (`deleted_at`) es el mecanismo real usado para "eliminar" en la UI.
- Esto está alineado correctamente con la regla de negocio explícita de `AGENTS.md`: *"Nunca eliminar historial"* para tareas — a nivel de base de datos, hoy es estructuralmente difícil borrar historial por accidente.
- **Nota**: esta garantía es solo tan fuerte como la disciplina del código de aplicación en no hacer `DELETE` reales; no se encontró ningún `DELETE FROM` en las migraciones ni en los repositorios revisados, pero vale la pena un test de regresión explícito (ver `05-testing-qa.md`) que verifique que borrar un cliente con proyectos asociados falla o hace soft-delete, nunca cascada real.

### 4. [BAJO] Reglas de integridad documentadas como "recomendadas, pre-11.2" sin mecanismo que las fuerce
- `docs/sprint-11-1/integrity-rules.md:46-50` lista 4 "validaciones mínimas recomendadas": no orfandad de FK, unicidad de códigos de proyecto, fechas válidas en actividades, valores de enum dentro de catálogo permitido.
- De estas, unicidad de `projects.code` sí está forzada (`unique` en `202607270002_core_tables.sql:63`) y los valores de enum de `workflow`/`status`/`priority` sí están forzados por tipos `ENUM` nativos. Pero **no hay ningún `CHECK` de validez de fechas** en `activities` (ej. que `review_date >= commitment_date`, o que `delivery_date` no sea anterior a `commitment_date`) — queda como validación puramente de aplicación, si es que existe.
- **Recomendación**: agregar `CHECK` constraints de fechas en `core.activities` dado que `commitmentDate`/`reviewDate` son, según `AGENTS.md`, campos obligatorios y centrales del modelo de negocio de tareas.

### 5. [INFO] Indexación cubre razonablemente los patrones de consulta esperados
- `supabase/migrations/202607270003_indexes.sql`: índices sobre todas las FK relevantes (`project_id`, `client_id`, `team_member_id`, `activity_id`), sobre columnas de filtro frecuente (`status`, `stage`, `active`, `archived`) y sobre las tres fechas de actividades (`commitment_date`, `review_date`, `delivery_date`) — coherente con vistas tipo calendario/agenda.
- Índices adicionales sobre `deleted_at` en las tablas con soft-delete, útiles para el filtro implícito "activos únicamente" que probablemente usa cada listado.
- No se detectan índices obviamente faltantes dado el esquema actual.

### 6. [ALTO] RLS sin scoping por fila — ver detalle en `02-seguridad.md`
- `supabase/migrations/202607270004_rls_initial.sql` y la sección RLS de `202607270005_resources_table.sql:54-110` aplican el mismo patrón `using (true)`/`with check (true)` a las 17 tablas para el rol `authenticated`, sin excepción para `resource_links`.
- Se documenta en profundidad, con impacto y recomendación, en `02-seguridad.md` (hallazgo #3) — se referencia aquí solo para que quede explícito que **ninguna tabla del esquema actual escapa a este problema**, incluida la más reciente.

### 7. [MEDIO] Backup es un procedimiento manual de exportación a Excel, no un backup real de base de datos
- Archivo: `docs/sprint-11-1/backup-checklist.md`
- El procedimiento consiste en: entrar con un rol con permiso de exportación, exportar cada módulo a xlsx/csv manualmente, guardar los archivos en `backups/sprint-11-1/raw`, y registrar un checksum SHA256 en un manifest — todo ejecutado a mano por una persona.
- El propio documento aclara: *"Estos archivos son solo respaldo. NO se importan automáticamente a PostgreSQL"* — es decir, no hay un camino de restauración automatizado, y no hay evidencia de `pg_dump` programado, point-in-time recovery de Supabase, o cualquier backup a nivel de base de datos configurado en el repositorio.
- **Recomendación**: una vez que `NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase` sea el modo real de producción (ver `02-seguridad.md`, hallazgo #10), configurar backups automáticos de Supabase (point-in-time recovery o `pg_dump` programado) — el checklist manual de exportación no es un plan de recuperación ante desastres viable para datos reales de clientes.

### 8. [INFO] Los repositorios (`lib/repositories/*.ts`) consultan Supabase por selects simples, sin paginación visible
- Se revisaron `clients-repository.ts`, `projects-repository.ts`, `team-repository.ts`: los métodos de listado (`select("*")` sin `.range()`/`.limit()`) traen la tabla completa en cada carga.
- Con el volumen actual de datos de un despacho pequeño esto no es un problema, pero es un punto a vigilar si el número de proyectos/actividades históricas crece con los años — sobre todo combinado con el hallazgo de `04-calidad-frontend.md` sobre autoguardado del array completo sin diffing.

## Resumen de riesgo

El modelo relacional en sí está razonablemente bien diseñado (soft-delete consistente, FKs sin cascada destructiva, enums nativos, buena indexación). El riesgo real del "modelo de datos" en este proyecto no está en el diseño del esquema, sino en tres capas por fuera de él: (a) RLS sin scoping (`02-seguridad.md`), (b) que el esquema puede no ser la fuente de datos activa en absoluto mientras `NEXT_PUBLIC_CINCEL_DATA_SOURCE` no esté en `"supabase"`, y (c) ausencia de un backup real de base de datos más allá de un checklist manual de exportación.
