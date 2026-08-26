# Revisión en profundidad — Arquitectura y organización del código

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (== `main`, HEAD `d7af1b3`)
Alcance: `app/`, `components/`, `lib/`, convenciones de `AGENTS.md`, deuda técnica documentada.

## Estructura general vs. `AGENTS.md`

La estructura real coincide en líneas generales con lo descrito en `AGENTS.md` (`app/` para rutas, `components/` para UI reutilizable, `lib/` para datos/tipos/utilidades), pero `AGENTS.md` quedó desactualizado respecto a `lib/`: describe solo `lib/data`, `lib/templates` y `lib/types`, mientras que hoy existen además `lib/repositories/` (9 archivos), `lib/auth/` (3 archivos), `lib/calendar/`, `lib/settings/`, `lib/supabase/` (4 archivos) y `lib/utils/`. Ninguno de estos módulos nuevos está documentado en `AGENTS.md`.

- **Severidad: Baja.** `AGENTS.md` es la guía que los propios agentes de IA (y desarrolladores nuevos) usan para orientarse; que no mencione `lib/auth`, `lib/repositories` o `lib/supabase` — que son precisamente los módulos más sensibles del proyecto — aumenta el riesgo de que futuros cambios los pasen por alto o dupliquen su lógica.
- **Recomendación:** actualizar la sección "Arquitectura" de `AGENTS.md` para reflejar `lib/repositories`, `lib/auth`, `lib/supabase`, `lib/settings`, `lib/calendar`.

## Duplicación de código (viola el principio central de `AGENTS.md`)

`AGENTS.md` es explícito: *"No crear componentes nuevos si ya existe uno reutilizable"* y *"Priorizar reutilización sobre duplicación"*. Se encontraron violaciones directas de este principio:

- **Severidad: Alta.** `app/contratistas/page.tsx` (1140 líneas) y `app/proveedores/contratistas/page.tsx` (1140 líneas) son ~88% idénticos — un `diff` produce solo 136 líneas de diferencia, limitadas casi enteramente a la paleta de colores de badges de estado (`bg-emerald-500 text-white` vs `bg-emerald-100 text-emerald-700`, etc.). Es la misma pantalla de "Contratistas" duplicada byte a byte en dos rutas distintas en vez de compartir un componente o redirigir una ruta a la otra.
  - **Recomendación:** extraer un componente compartido (`components/proveedores/ContractorsWorkspace.tsx` o similar) parametrizado por tema de color, y que ambas rutas lo consuman. Si una de las dos rutas es legado, considerar un `redirect` de Next.js en su lugar.
- **Severidad: Media.** El mismo patrón de tamaño casi idéntico se repite entre `app/proveedores/colaboradores/page.tsx` (921 líneas) y `app/proveedores/tiendas/page.tsx` (850 líneas) — no se hizo diff línea a línea de estos dos, pero dado el patrón confirmado arriba y que ambos son variantes del mismo "catálogo de proveedores", vale la pena auditarlos con el mismo criterio.
  - **Recomendación:** antes de agregar un cuarto tipo de proveedor, generalizar el patrón en un único componente parametrizable (tipo de proveedor, columnas, colores) en vez de seguir copiando el archivo.

## Archivos excesivamente grandes

| Archivo | Líneas |
|---|---|
| `app/equipo/page.tsx` | 2226 |
| `app/clientes/page.tsx` | 1637 |
| `components/proyectos/ProjectsTable.tsx` | 1576 |
| `lib/auth/permissions.ts` | 1238 |
| `components/recursos/ResourcesWorkspace.tsx` | 1218 |
| `app/proveedores/contratistas/page.tsx` / `app/contratistas/page.tsx` | 1140 cada uno |
| `components/dashboard/InteractiveDashboard.tsx` | 1041 |
| `app/clientes/[id]/page.tsx` | 1020 |

- **Severidad: Media.** `app/equipo/page.tsx` con 2226 líneas es un solo archivo de página que casi con seguridad mezcla fetching, estado de formularios, tablas y modales de edición. Es el tipo de archivo donde los bugs se esconden y donde el costo de cualquier cambio crece rápido.
  - **Nota:** `lib/auth/permissions.ts` (1238 líneas) es grande casi enteramente porque enumera de forma explícita las capacidades de 9 roles × 7 módulos (`DASHBOARD_CAPABILITIES_BY_ROLE`, `PROJECTS_CAPABILITIES_BY_ROLE`, etc.) — es repetitivo pero legible y no es mala práctica per se; el riesgo real de ese archivo se cubre en profundidad en [02-seguridad.md](./02-seguridad.md) (es enforcement 100% client-side).
  - **Recomendación:** dado que no hay tests automatizados que den cobertura a un refactor seguro (ver [05-testing-qa.md](./05-testing-qa.md)), no recomendamos romper `app/equipo/page.tsx` de forma agresiva hoy. Priorizar primero tener al menos un test de regresión E2E real para el módulo Equipo, y luego dividir la página en subcomponentes (tabla, drawer de edición, formulario de alta) siguiendo el patrón que ya existe en `components/proyectos/`.

## Consistencia en el acceso a datos

Todos los módulos de negocio (`clients-repository.ts`, `projects-repository.ts`, `team-repository.ts`, `providers-repository.ts`, `resources-repository.ts`, `activities-repository.ts`) están detrás de `lib/repositories/`, y todos consultan `isSupabaseEnabled()` / `getDataSource()` para decidir entre Supabase y `localStorage`. Esto es una buena práctica de arquitectura — el acceso a datos está centralizado y no disperso en cada página — y reduce el riesgo de que un módulo nuevo "olvide" pasar por el mismo camino.

- **Severidad: Informativa (no es un hallazgo, es una fortaleza).** El patrón repositorio + selector de fuente de datos es el mecanismo correcto para una migración progresiva de `localStorage` a Supabase, y está aplicado de forma consistente en los 6 dominios revisados.

## Deuda técnica auto-reportada por el equipo

`docs/sprint-12-0/technical-debt.md` registra un único ítem abierto a la fecha de la revisión:

- **DT-12-001** (Prioridad Media): warnings de lint `@next/next/no-img-element` en `components/configuracion/GeneralSettingsWorkspace.tsx` por usar `<img>` en vez de `next/image` en previsualizaciones de logo. El commit `e77b7d3` ("chore(header): replace img with next/image") resolvió el caso de `components/layout/Header.tsx`, pero **no** el de `GeneralSettingsWorkspace.tsx` — se confirmó (ver [04-calidad-frontend.md](./04-calidad-frontend.md)) que ese archivo sigue usando `<img>` directamente. DT-12-001 sigue siendo un ítem legítimamente pendiente, no resuelto por error.

`docs/sprint-12-0/propuesta-planificacion.md` es solo una propuesta (no ejecutada aún) para el próximo sprint, centrada en: cerrar DT-12-001, extender aserciones E2E de regresión en Clientes/Proyectos, y documentar runbooks de incidentes de Supabase. No incluye explícitamente el corte de `localStorage` → Supabase como criterio de salida — algo que sí valdría la pena añadir dado el hallazgo #1 del resumen ejecutivo.

## Otros hallazgos

- **Severidad: Baja.** `backups/` (532 KB, dos `.tar.gz` con fecha) está commiteado al repositorio en vez de vivir en almacenamiento externo (Drive, bucket, etc.). No es un problema hoy por el tamaño, pero es un patrón que crece sin límite con cada sprint y no debería vivir en control de versiones de código.
  - **Recomendación:** mover `backups/*.tar.gz` fuera del repo (o a Git LFS / almacenamiento externo) y dejar solo `backups/sprint-11-1/manifest.md` como referencia.
- **Severidad: Informativa.** `next.config.ts` es mínimo (solo `allowedDevOrigins`) y `eslint.config.mjs` usa la configuración estándar de `eslint-config-next` sin reglas deshabilitadas — no hay señales de que se haya bajado la vara de linting para "hacer pasar" código problemático.
