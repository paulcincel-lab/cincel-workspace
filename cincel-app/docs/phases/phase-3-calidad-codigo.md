# Fase 3 — Calidad de Código y Deuda Técnica

Milestone de GitHub: **Alpha M3 — Calidad de Código y Deuda Técnica**

Fuente: `docs/review-2026-08-11/01-arquitectura.md`, `04-calidad-frontend.md`, `03-modelo-de-datos.md`.

---

### [ARCH] Consolidar app/contratistas y app/proveedores/contratistas (duplicados ~88%)
- Labels: architecture, alpha-m3, tech-debt
- Severidad: Alto
- Archivos: `app/contratistas/page.tsx` (1140 líneas), `app/proveedores/contratistas/page.tsx` (1140 líneas)
- Descripción: Ambos archivos son ~88% idénticos (136 líneas de diferencia, casi todas de paleta de color) — la misma pantalla de "Contratistas" duplicada byte a byte en dos rutas, violando el principio explícito de `AGENTS.md` de no duplicar componentes.
- Criterios de aceptación: se extrae un componente compartido parametrizado por tema/ruta; una de las dos rutas queda como `redirect` de Next.js si es legado, o ambas consumen el mismo componente.
- Referencias: `01-arquitectura.md`, hallazgo de duplicación.

---

### [ARCH] Auditar y generalizar el catálogo de proveedores (colaboradores/tiendas)
- Labels: architecture, alpha-m3, tech-debt
- Severidad: Medio
- Archivos: `app/proveedores/colaboradores/page.tsx` (921 líneas), `app/proveedores/tiendas/page.tsx` (850 líneas)
- Descripción: Mismo patrón de tamaño casi idéntico que contratistas/proveedores-contratistas; probable duplicación no confirmada con diff línea a línea.
- Criterios de aceptación: se audita con el mismo criterio que el issue de contratistas; si se confirma duplicación significativa, se generaliza en un único componente parametrizable (tipo de proveedor, columnas, colores) antes de agregar un cuarto tipo de proveedor.
- Referencias: `01-arquitectura.md`.

---

### [ARCH] Dividir app/equipo/page.tsx (2226 líneas) en subcomponentes
- Labels: architecture, alpha-m3, tech-debt
- Severidad: Medio
- Archivos: `app/equipo/page.tsx`
- Descripción: El archivo de página más grande del proyecto, casi con seguridad mezcla fetching, estado de formularios, tablas y modales de edición.
- Criterios de aceptación: dividir en subcomponentes (tabla, drawer de edición, formulario de alta) siguiendo el patrón ya existente en `components/proyectos/`.
- Depende de: contar con al menos un test E2E de regresión para el módulo Equipo (ver Fase 2) antes de refactorizar de forma agresiva.
- Referencias: `01-arquitectura.md`.

---

### [FE] Dividir ProjectsTable.tsx en subcomponentes + hook de datos
- Labels: frontend, alpha-m3, tech-debt
- Severidad: Alto
- Archivos: `components/proyectos/ProjectsTable.tsx` (1576 líneas)
- Descripción: Combina renderizado de tabla, filtrado, estado de modales, toma de notas, edición inline de celdas y sincronización con Supabase en un único componente cliente con más de 15 `useState`.
- Criterios de aceptación: se divide en subcomponentes (filtros, tabla, modal de creación, panel de notas); la lógica de datos/sincronización se extrae a un hook, siguiendo el patrón de `lib/settings/use-general-settings.ts`.
- Referencias: `04-calidad-frontend.md` hallazgo #1.

---

### [FE] Agregar semántica de diálogo y manejo de teclado a drawers/modales compartidos
- Labels: frontend, alpha-m3, accessibility
- Severidad: Medio
- Archivos: `components/tareas/TaskDrawer.tsx`, `components/tareas/NewTaskModal.tsx`
- Descripción: Ninguno de los dos archivos usa `aria-`, `role=`, `onKeyDown`, `Escape` o manejo de foco. Sin `role="dialog"`/`aria-modal`, sin cierre con Escape, sin trampa ni retorno de foco. Solo 14 de ~118 archivos del proyecto usan algún atributo `aria-`. Los drawers son el patrón estándar de edición según `AGENTS.md`, así que este problema se replica en cada módulo que lo use.
- Criterios de aceptación: el patrón compartido de drawer/modal (o cada consumidor, si no hay uno compartido aún) implementa `role="dialog"`, `aria-modal`, cierre con Escape, trampa de foco y retorno de foco al cerrar.
- Referencias: `04-calidad-frontend.md` hallazgo #4.

---

### [FE] Reemplazar estado dummy por estado derivado en TareasPageClient.tsx
- Labels: frontend, alpha-m3, low-effort
- Severidad: Bajo
- Archivos: `app/tareas/TareasPageClient.tsx:118`
- Descripción: `const [, setTasksVersion] = useState(0)` se usa únicamente para forzar re-renders, indicando estado derivado que no se calcula de forma reactiva.
- Criterios de aceptación: se reemplaza por estado derivado/memoizado (`useMemo`) correctamente calculado a partir del estado real.
- Referencias: `04-calidad-frontend.md` hallazgo #5.

---

### [FE] Agregar estados de carga/error visibles durante el fetch inicial
- Labels: frontend, alpha-m3
- Severidad: Bajo
- Archivos: `components/proyectos/ProjectsTable.tsx`, `app/tareas/TareasPageClient.tsx`
- Descripción: Los fallos de fetch de Supabase pasan por `reportSupabaseError()` de forma silenciosa (solo consola), sin spinner de carga ni banner de error visible mientras el fetch resuelve. El usuario ve datos obsoletos/mock sin ninguna indicación de sincronización en curso o fallida.
- Criterios de aceptación: ambos componentes muestran un estado de carga visible durante el fetch inicial y un banner de error si `reportSupabaseError()` se dispara.
- Referencias: `04-calidad-frontend.md` hallazgo #6.

---

### [ARCH] Cerrar DT-12-001: reemplazar `<img>` por `next/image` en GeneralSettingsWorkspace.tsx
- Labels: frontend, alpha-m3, tech-debt, already-tracked
- Severidad: Medio (ya aprobado para Sprint 12 en `docs/sprint-12-0/technical-debt.md`)
- Archivos: `components/configuracion/GeneralSettingsWorkspace.tsx:333,414`
- Descripción: Dos previsualizaciones de logo (PNG/JPG, incluyendo data URL) siguen usando `<img>` crudo, generando warnings de lint `@next/next/no-img-element`. El commit `e77b7d3` ya resolvió el caso equivalente en el header.
- Criterios de aceptación (ya definidos en DT-12-001): reemplazar `img` por `next/image` en ambas previsualizaciones, manteniendo el comportamiento de preview para PNG/JPG (incluyendo data URL); `npm run lint` sin warnings de `no-img-element`.
- Referencias: `docs/sprint-12-0/technical-debt.md` (DT-12-001), `01-arquitectura.md`, `04-calidad-frontend.md` hallazgo #7.

---

### [ARCH] Mover backups/*.tar.gz fuera del control de versiones
- Labels: architecture, alpha-m3, low-effort
- Severidad: Bajo
- Archivos: `backups/` (532 KB, dos `.tar.gz`)
- Descripción: Los backups manuales están commiteados directamente al repositorio de código en vez de vivir en almacenamiento externo. No es un problema por tamaño hoy, pero es un patrón que crece sin límite con cada sprint.
- Criterios de aceptación: los `.tar.gz` se mueven a almacenamiento externo (Drive, bucket, Git LFS); solo el manifest (`backups/sprint-11-1/manifest.md`) queda en el repo como referencia.
- Referencias: `01-arquitectura.md`.

---

### [DATA] Documentar o resolver la excepción de PK en resource_links (text vs uuid)
- Labels: database, alpha-m3, low-effort
- Severidad: Medio
- Archivos: `supabase/migrations/202607270005_resources_table.sql:4`
- Descripción: `resource_links` usa `id text primary key` en vez de `uuid default gen_random_uuid()`, rompiendo la convención documentada en `docs/sprint-11-1/integrity-rules.md` ("todas las tablas usan UUID como PK") sin explicación registrada.
- Criterios de aceptación: se documenta explícitamente la excepción en `integrity-rules.md` con la razón (ej. IDs legibles/estables), o se migra la tabla a `uuid` por consistencia.
- Referencias: `03-modelo-de-datos.md` hallazgo #1.

---

### [DATA] Agregar paginación a listados de repositorios (backlog)
- Labels: database, alpha-m3, performance, backlog
- Severidad: Bajo (informativo, no urgente con el volumen actual)
- Archivos: `lib/repositories/clients-repository.ts`, `projects-repository.ts`, `team-repository.ts`
- Descripción: Los métodos de listado usan `select("*")` sin `.range()`/`.limit()`, trayendo la tabla completa en cada carga. No es un problema con el volumen actual de un despacho pequeño, pero es un punto a vigilar a medida que crece el histórico.
- Criterios de aceptación: se agrega paginación (`.range()`) a los listados más grandes cuando el volumen de datos lo justifique; issue de backlog, no bloqueante para alpha.
- Referencias: `03-modelo-de-datos.md` hallazgo #8.
