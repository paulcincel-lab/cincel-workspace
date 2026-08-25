# Revisión en profundidad — Testing y QA

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (== `main`, HEAD `d7af1b3`)
Alcance: scripts en `scripts/`, checklists de QA en `docs/`, CI/CD, cobertura por módulo.

## Resumen ejecutivo

No existe ningún framework de pruebas unitarias/de componentes (`package.json` no declara jest/vitest/mocha, y no hay un solo archivo `*.test.*`/`*.spec.*` en todo el repositorio). `playwright` está declarado como devDependency pero **no se usa como test runner**: no hay `playwright.config.ts`; se usa como librería de automatización de navegador cruda dentro de dos scripts `.mjs` sueltos. No existe ningún pipeline de CI/CD (cero archivos `.yml`/`.yaml` en todo el repo, sin `.github/workflows/`). Todo el proceso de verificación —lint, build, health-checks, los dos scripts E2E y los checklists de QA— se ejecuta manualmente por un desarrollador antes de cerrar cada sprint.

## Hallazgos

### 1. [ALTO] No hay framework de pruebas unitarias
- `package.json` no tiene ningún test runner instalado.
- Los dos archivos de lógica de negocio más grandes y críticos del repo, `lib/auth/permissions.ts` (1238 líneas) y `lib/auth/auth-service.ts` (603 líneas), no tienen ninguna cobertura de regresión.
- **Recomendación**: adoptar vitest (o similar) para `lib/`, empezando por permisos y autenticación.

### 2. [ALTO] `playwright` está instalado pero nunca se usa como test runner real
- No hay `playwright.config.ts` en ningún lugar del repo. Se importa directamente (`import { chromium } from "playwright"`) dentro de scripts standalone.
- **Recomendación**: adoptar el test runner real de Playwright, o renombrar/documentar los scripts actuales para que no den la impresión de ser una suite de pruebas formal.

### 3. [MEDIO] La cobertura E2E son dos scripts artesanales, no una suite
- `scripts/e2e-login-crud-clientes.mjs` (212 líneas): cubre exactamente un ciclo CRUD completo — solo el módulo Clientes (crear/editar/eliminar).
- `scripts/e2e-sprint11-modules-review.mjs` (258 líneas): solo verifica que 9 rutas de módulo rendericen su `<h1>` esperado sin errores de consola/REST — no hace ninguna aserción sobre el comportamiento real de cada módulo.
- **Recomendación**: extender el patrón de CRUD a Proyectos/Tareas/Equipo, o migrar a specs reales de Playwright.

### 4. [MEDIO] Ninguno de los dos scripts E2E está integrado a `package.json` ni a herramientas descubribles
- Solo `health:check` y `health:check:authenticated` están registrados como scripts npm.
- Ejecutar los E2E requiere saber que existen y correr `node scripts/e2e-*.mjs` manualmente.
- **Recomendación**: agregar alias `npm run e2e:*` como mínimo.

### 5. [MEDIO] El script de login E2E evita el flujo real de login
- `scripts/e2e-login-crud-clientes.mjs:14-107` (`seedAuth`) escribe una sesión pre-hasheada directamente en `localStorage` antes de visitar `/login`, reimplementando el mismo `simpleHash` no criptográfico de la app (contraseña hardcodeada `"Temporal123"`).
- Esto significa que el E2E "de login" valida navegación de UI, no el path real de verificación de credenciales — y de paso es una prueba de concepto funcional de lo fácil que es scriptear alrededor de la autenticación cliente-side (ver `02-seguridad.md`, hallazgo #2).

### 6. [MEDIO] El último reporte E2E cubre Calendario/Configuración/Permisos, pero el sistema de Exportación queda fuera
- `docs/sprint-11-1/e2e-modules-report.json`, fechado `2026-07-28T00:41:13Z`, es posterior a los commits de Calendario (`22d5fb0`, 2026-07-25), Configuración General (`863c010`, 2026-07-25) y Permisos (`77622d7`, 2026-07-25) — corrección a una lectura inicial: el reporte sí lista explícitamente los módulos `Calendario`, `Configuración` y `Permisos` entre sus 9 entradas, cada uno con `ok: true`.
- Dicho esto, esa cobertura sigue siendo solo smoke-test ("renderiza el heading esperado, sin errores de consola/REST"), no verificación funcional (no valida, por ejemplo, que crear un evento de calendario o cambiar un permiso realmente persista). El sistema centralizado de Exportación (`49d9e19`, 2026-07-26) no aparece como módulo propio en el reporte — al no tener ruta dedicada (se usa embebido vía `ExportMenu` dentro de otras páginas), no hay evidencia de que el smoke test dispare ni verifique ese flujo.

### 7. [BAJO] Los health-checks son diagnósticos manuales de conectividad, no pruebas de aplicación
- `scripts/health-check.mjs` / `scripts/health-check-authenticated.mjs`: verifican presencia de URL/key de Supabase, que el `project_ref` coincida con `cincel-beta`, y miden latencia. Útiles para un desarrollador corriendo `npm run health:check` localmente, pero no forman parte de ningún pipeline automatizado.

### 8. [ALTO] No existe ningún pipeline de CI/CD
- Confirmado: cero archivos `.yml`/`.yaml` en todo el repositorio, sin directorio `.github/workflows/`.
- Lint, build, health-checks y ambos scripts E2E se ejecutan manualmente y en local antes de cerrar un sprint; nada bloquea automáticamente un merge o release con una regresión.
- **Recomendación**: como mínimo, un workflow de GitHub Actions que corra `npm run lint` y `npm run build` en cada PR.

### 9. [MEDIO] La QA de flujos críticos es enteramente manual
- `docs/qa-checklist-exportacion.md`, `docs/qa-checklist-flujos-tareas.md`, `docs/qa-evidencia-exportacion-beta12-1.md` son checklists paso a paso para un tester humano (ej. "Ingresar con rol Administrador y validar que aparece el botón Exportar").
- Es, notablemente, la **única** verificación de que la visibilidad de botones por rol funciona correctamente — algo que `02-seguridad.md` ya marca como aplicado solo en la UI, sin respaldo en la capa de datos. Se reverifica una vez por sprint, por una persona, no en cada cambio.

### 10. [ALTO] Cero cobertura automatizada — ni siquiera scripts ad hoc — para la mayoría de los módulos
Sin ninguna prueba automatizada: Tareas (incluyendo las reglas de negocio de `AGENTS.md` sobre `commitmentDate`/`reviewDate` y "nunca eliminar historial"), Proyectos, Equipo, Permisos (la matriz de permisos en sí), Calendario, Configuración/Ajustes Generales, y la salida real de archivos del sistema de exportación. Solo el CRUD de Clientes tiene cobertura con aserciones.

### 11. [BAJO] Contraseña de prueba compartida y datos sintéticos tipo-PII en el script E2E
- `scripts/e2e-login-crud-clientes.mjs:37` hardcodea `"Temporal123"` e inyecta datos sintéticos con forma de PII (nombre, CURP, RFC, domicilio) en `localStorage`. Riesgo bajo en local; el script acepta overrides `E2E_BASE_URL`/`E2E_SUPABASE_BEARER`, así que apuntarlo a un proyecto de staging compartido sin limpieza visible podría contaminar datos compartidos.

## Matriz de cobertura por módulo

| Módulo | Cobertura automatizada |
|---|---|
| Clientes | CRUD completo (script E2E) |
| Dashboard, Proyectos, Recursos, Equipo, Actividades, Permisos (config. previa a 2026-07-28) | Solo smoke test (heading renderiza, sin error de consola) |
| Calendario, Configuración General, Sistema de Exportación | **Ninguna** |
| Tareas (Presale/Diseño/Operativas) | **Ninguna** |
| Login/Auth | Solo indirecta (usada como setup del E2E de Clientes) |

## Recomendación priorizada
1. Adoptar Playwright como test runner real + workflow de CI mínimo (lint + build + e2e) — cierra los hallazgos #2 y #8 a la vez.
2. Priorizar cobertura automatizada de Tareas y Permisos dado que tienen reglas de negocio explícitas (`AGENTS.md`) y son, según `02-seguridad.md`, el punto más débil de aplicación de reglas.
3. Regenerar y automatizar `e2e-modules-report.json` como parte del pipeline, no como artefacto manual de cierre de sprint.
