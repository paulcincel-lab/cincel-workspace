# Fase 1 — Autorización en Capa de Datos y Persistencia de Tareas

Milestone de GitHub: **Alpha M1 — Autorización en Capa de Datos y Persistencia de Tareas**

Fuente: `docs/review-2026-08-11/02-seguridad.md`, `01-arquitectura.md`, `04-calidad-frontend.md`, `03-modelo-de-datos.md`, `06-recomendaciones.md`.

---

### [SEC] Mover autorización de "qué puede hacer cada rol" de la UI a la capa de datos
- Labels: security, alpha-m1
- Severidad: Alto
- Archivos: `lib/auth/permissions.ts` (1238 líneas), `lib/repositories/*.ts`
- Descripción: `permissions.ts` decide qué botones mostrar/ocultar, pero ningún repositorio revalida esos permisos antes de escribir en Supabase. Ocultar un botón no impide una llamada directa con la misma anon key pública.
- Criterios de aceptación:
  - Los repositorios (o las políticas RLS, si ya están scoped) validan la capacidad real del usuario antes de ejecutar la escritura, no solo la UI.
  - Se agregan pruebas que confirmen que un usuario sin permiso de escritura recibe un error al intentar la operación directamente (bypasseando la UI).
- Depende de: `[SEC] Diseñar políticas RLS con scoping real` (Fase 0).
- Referencias: `02-seguridad.md` hallazgo #2.

---

### [ARCH] Dar persistencia real a los módulos de Tareas (Presale/Diseño/Operativas)
- Labels: architecture, alpha-m1, data-layer
- Severidad: Alto
- Archivos: `lib/data/presale.ts`, `lib/data/diseno.ts`, `lib/data/operativas.ts`, `app/tareas/*`
- Descripción: A diferencia de Clientes/Proyectos/Equipo, los módulos de Tareas no tienen capa de repositorio — se importan directamente arrays estáticos en memoria. Las ediciones probablemente no sobreviven un refresh, pese a que `AGENTS.md` define reglas de negocio estrictas para tareas (`commitmentDate`, `reviewDate`, "nunca eliminar historial").
- Criterios de aceptación:
  - Nuevo `lib/repositories/tasks-repository.ts` siguiendo el patrón ya usado en `projects-repository.ts` / `clients-repository.ts`, con soporte para `localStorage` y Supabase vía `getDataSource()`.
  - Las páginas de Tareas (`app/tareas/*`) consumen el repositorio en vez de los arrays estáticos de `lib/data/`.
  - Verificado que editar una tarea y refrescar la página conserva los cambios.
- Referencias: `01-arquitectura.md`, `06-recomendaciones.md` #7.

---

### [FE] Corregir autoguardado sin debounce/diff en ProjectsTable.tsx
- Labels: frontend, alpha-m1, data-integrity
- Severidad: Alto
- Archivos: `components/proyectos/ProjectsTable.tsx:345, 361-365, 377-390`
- Descripción: Cualquier cambio a `projectsData` (incluso de estado de UI no relacionado) dispara un `useEffect` que guarda el array completo a Supabase sin debounce ni diffing. Además, el estado inicial se siembra desde `localStorage` y luego se sobrescribe de forma asíncrona con datos de Supabase, mostrando datos obsoletos brevemente. Riesgo de tormentas de escritura y pérdida de cambios entre usuarios concurrentes.
- Criterios de aceptación:
  - El guardado a Supabase usa debounce y solo envía las filas efectivamente modificadas (diff), no el array completo en cada render relevante.
  - El estado inicial no se siembra desde `localStorage` cuando hay una fuente Supabase activa (`getDataSource() === "supabase"`).
- Referencias: `04-calidad-frontend.md` hallazgo #2.

---

### [DATA] Agregar CHECK constraints de fechas en core.activities
- Labels: database, alpha-m1, data-integrity
- Severidad: Medio
- Archivos: nueva migración en `supabase/migrations/`
- Descripción: No hay ningún `CHECK` de validez de fechas en `core.activities` (por ejemplo, que `review_date >= commitment_date`). `commitmentDate`/`reviewDate` son campos obligatorios y centrales del modelo de negocio de tareas según `AGENTS.md`, pero hoy la validación es puramente de aplicación (si es que existe).
- Criterios de aceptación:
  - Nueva migración agrega `CHECK` constraints razonables sobre las fechas de `core.activities`.
  - `docs/sprint-11-1/integrity-rules.md` se actualiza para reflejar la nueva regla forzada a nivel de base de datos.
- Referencias: `03-modelo-de-datos.md` hallazgo #4.
