# Revisión técnica en profundidad — Cincel Workspace

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (HEAD `d7af1b3`, idéntica a `main` — no hay diff entre ambas)
Alcance: repositorio completo (`cincel-app/`), ~27.6k líneas TS/TSX en `app/` + `components/` + `lib/`, 118 archivos, migraciones Supabase, scripts E2E/health-check y documentación de sprints existente (`docs/sprint-11-1`, `docs/sprint-12-0`, `docs/auth-v1-*`).

Esta carpeta contiene una auditoría independiente del estado actual del proyecto, complementaria a la deuda técnica ya documentada por el equipo en `docs/sprint-12-0/technical-debt.md`. Donde el equipo ya conocía y documentó un riesgo, se indica explícitamente ("ya conocido") en vez de presentarlo como hallazgo nuevo.

## Índice

1. [01-arquitectura.md](./01-arquitectura.md) — organización del código, adherencia a `AGENTS.md`, deuda técnica auto-reportada.
2. [02-seguridad.md](./02-seguridad.md) — autenticación, autorización, RLS de Supabase, manejo de secretos.
3. [03-modelo-de-datos.md](./03-modelo-de-datos.md) — esquema Supabase, integridad referencial, deriva ERD/diccionario vs. migraciones.
4. [04-calidad-frontend.md](./04-calidad-frontend.md) — patrones React/TS, duplicación, accesibilidad, manejo de estados de carga/error.
5. [05-testing-qa.md](./05-testing-qa.md) — cobertura automatizada, scripts E2E, checklists manuales, CI.
6. [06-recomendaciones.md](./06-recomendaciones.md) — plan de acción priorizado.

## Cómo leer esta revisión

Cada hallazgo incluye: severidad (**Crítico** / **Alto** / **Medio** / **Bajo**), archivo(s) con línea, descripción de una frase, y recomendación concreta. Las severidades se calibran para un ERP que va a manejar datos de clientes y proyectos reales de un despacho de arquitectura — no para un prototipo interno.

## Resumen ejecutivo

El proyecto tiene una base de código ordenada, con buena disciplina de tipado (`strict: true`, cero usos de `: any` en 27.6k líneas) y una filosofía de producto clara (`AGENTS.md`). Sin embargo, la revisión encuentra que **el sistema, tal como está en `release/v1.0`, no tiene una capa de seguridad real ni una fuente de datos persistente confirmada**, algo que el propio equipo ya documentó como riesgo conocido pero que sigue sin resolverse al cierre del Sprint 11.

### Los 3 hallazgos que más importan

| # | Severidad | Hallazgo | Detalle |
|---|---|---|---|
| 1 | **Crítico** | La fuente de datos activa por defecto sigue siendo `localStorage`, no Supabase | `lib/supabase/data-source.ts:7-17` — el comentario del propio código dice "Durante Sprint 11.2 el default sigue siendo localstorage. En Sprint 11.3 se eliminará localStorage". `docs/sprint-11-1/README.md` confirma explícitamente que ese sprint "NO conecta la aplicación a Supabase y NO migra datos". No hay evidencia en el historial de que ese corte se haya ejecutado. Esto implica que en una instalación por defecto, los datos de clientes/proyectos/tareas viven únicamente en el navegador de cada usuario. Ver [03-modelo-de-datos.md](./03-modelo-de-datos.md). |
| 2 | **Crítico** | Autenticación y autorización 100% client-side, sin ninguna verificación de servidor | `lib/auth/auth-service.ts` implementa sesión y hash de contraseña (FNV-1a sin sal, `simpleHash()` línea 78-87) enteramente en `localStorage`; no hay `middleware.ts` ni llamada real a `supabase.auth.*` en todo el repo. El propio equipo lo documentó como riesgo conocido en `docs/auth-v1-technical-review.md:38-40` ("Hash de contraseña simplificado para V1, no apto para producción"). Ver [02-seguridad.md](./02-seguridad.md). |
| 3 | **Crítico** | Las políticas RLS de Supabase dan acceso total a cualquier usuario autenticado | `supabase/migrations/202607270004_rls_initial.sql` crea, para las 16 tablas core, políticas `USING (true)` / `WITH CHECK (true)` para SELECT/INSERT/UPDATE/DELETE al rol `authenticated`, sin ningún filtro por organización, proyecto o rol. Combinado con el hallazgo #2, el día que se apunte la app a Supabase, cualquier sesión autenticada (real o falsificada) tiene control total sobre todos los datos de todos los clientes. Ver [02-seguridad.md](./02-seguridad.md). |

Estos tres hallazgos están relacionados y ya fueron parcialmente auto-documentados por el equipo (`auth-v1-technical-review.md`, `sprint-11-1/README.md`), lo cual es una buena señal de disciplina — pero como release `v1.0` implican que **el producto aún no tiene una postura de seguridad ni de persistencia apta para manejar datos reales de clientes**, y deberían bloquear cualquier lanzamiento a producción hasta resolverse.

### Otros hallazgos relevantes (no bloqueantes, pero con impacto real)

- **Cero pruebas automatizadas** (sin `*.spec.*`, sin `playwright.config`, sin CI en `.github/`) sobre un ERP de 27.6k líneas con un sistema de permisos de 9 roles × 6 módulos. Ver [05-testing-qa.md](./05-testing-qa.md).
- **Duplicación de código significativa**: `app/contratistas/page.tsx` y `app/proveedores/contratistas/page.tsx` son ~88% idénticos (1140 líneas cada uno), violando el principio explícito de `AGENTS.md` ("no crear componentes nuevos si ya existe uno reutilizable"). Ver [01-arquitectura.md](./01-arquitectura.md).
- **Deriva de documentación de esquema**: el ERD y el diccionario de datos de Sprint 11.1 no reflejan la tabla `resource_links` agregada en la migración de Sprint 11.2. Ver [03-modelo-de-datos.md](./03-modelo-de-datos.md).
- **Archivos muy grandes** (`app/equipo/page.tsx` con 2226 líneas) sin red de pruebas que respalde refactors futuros. Ver [01-arquitectura.md](./01-arquitectura.md) y [04-calidad-frontend.md](./04-calidad-frontend.md).

### Lo que está bien hecho

- TypeScript estricto y sin escapes (`tsconfig.json` `strict: true`, cero `: any` encontrados).
- Sin `console.*` de depuración fuera de manejo de errores intencional (`lib/supabase/errors.ts`).
- `.env*` correctamente en `.gitignore`; no se encontraron secretos comprometidos en el árbol de trabajo.
- Modelo de soft-delete consistente (`deleted_at` en todas las tablas) que sí soporta la regla de negocio "nunca eliminar historial" de `AGENTS.md`.
- El equipo mantiene una disciplina de documentación de sprint (changelog, checklists QA, reportes E2E) poco común en proyectos de este tamaño, y ya había identificado varios de los riesgos críticos de este informe antes de que lo hiciéramos nosotros.
