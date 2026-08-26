# Fase 2 — Testing Automatizado y CI

Milestone de GitHub: **Alpha M2 — Testing Automatizado y CI**

Fuente: `docs/review-2026-08-11/05-testing-qa.md`.

---

### [QA] Adoptar Playwright como test runner real
- Labels: testing, alpha-m2
- Severidad: Alto
- Archivos: (nuevo) `playwright.config.ts`, `package.json`
- Descripción: `playwright` está declarado como devDependency pero no se usa como test runner — no existe `playwright.config.ts`; se usa como librería de automatización cruda dentro de scripts `.mjs` sueltos.
- Criterios de aceptación: `playwright.config.ts` creado, al menos un spec real bajo un directorio `tests/` o `e2e/`, ejecutable vía `npx playwright test`.
- Referencias: `05-testing-qa.md` hallazgo #2.

---

### [QA] Adoptar vitest (o equivalente) para pruebas unitarias de lib/
- Labels: testing, alpha-m2
- Severidad: Alto
- Archivos: (nuevo) config de vitest, `lib/auth/permissions.ts`, `lib/auth/auth-service.ts`
- Descripción: No existe ningún framework de pruebas unitarias en el proyecto. Los dos archivos de lógica de negocio más grandes y críticos (`permissions.ts`, 1238 líneas; `auth-service.ts`, 603 líneas) no tienen ninguna cobertura de regresión.
- Criterios de aceptación: vitest instalado y configurado; suite inicial cubriendo al menos las funciones de resolución de capacidades en `permissions.ts` y el flujo de login/hash en `auth-service.ts`.
- Referencias: `05-testing-qa.md` hallazgo #1.

---

### [QA] Crear pipeline de CI mínimo (GitHub Actions)
- Labels: ci, alpha-m2, infra
- Severidad: Alto
- Archivos: (nuevo) `.github/workflows/ci.yml`
- Descripción: No existe ningún archivo `.yml`/`.yaml` en el repositorio ni directorio `.github/workflows/`. Todo el proceso de verificación se ejecuta manualmente antes de cerrar cada sprint; nada bloquea automáticamente un merge o release con una regresión.
- Criterios de aceptación: workflow de GitHub Actions que corre `npm ci`, `npm run lint` y `npm run build` en cada PR contra `main`/`release/*`; falla el check si cualquiera de los tres falla.
- Referencias: `05-testing-qa.md` hallazgo #8.

---

### [QA] Extender cobertura E2E a Proyectos, Tareas y Equipo
- Labels: testing, alpha-m2
- Severidad: Medio
- Archivos: `scripts/e2e-login-crud-clientes.mjs` (patrón de referencia)
- Descripción: La única cobertura E2E con aserciones reales es el CRUD de Clientes. El resto de los módulos solo tiene, en el mejor caso, un smoke test de que la página renderiza.
- Criterios de aceptación: specs (idealmente ya en Playwright test runner, ver issue relacionado) que cubran creación/edición de un proyecto, una tarea y un miembro de equipo, con aserciones sobre persistencia real.
- Referencias: `05-testing-qa.md` hallazgo #3.

---

### [QA] Integrar los scripts E2E existentes como comandos npm descubribles
- Labels: testing, alpha-m2, low-effort
- Severidad: Medio
- Archivos: `package.json`, `scripts/e2e-login-crud-clientes.mjs`, `scripts/e2e-sprint11-modules-review.mjs`
- Descripción: Ninguno de los dos scripts E2E está registrado en `package.json`; solo `health:check` y `health:check:authenticated` lo están. Ejecutarlos requiere saber que existen.
- Criterios de aceptación: se agregan scripts npm (ej. `e2e:clientes`, `e2e:modules-smoke`) que invocan estos archivos.
- Referencias: `05-testing-qa.md` hallazgo #4.

---

### [QA] Reescribir el E2E de login para probar el flujo real de autenticación
- Labels: testing, alpha-m2
- Severidad: Medio
- Archivos: `scripts/e2e-login-crud-clientes.mjs:14-107` (`seedAuth`)
- Descripción: El script actual escribe una sesión pre-hasheada directamente en `localStorage` antes de visitar `/login`, reimplementando el mismo hash no criptográfico de la app — valida navegación de UI, no el path real de verificación de credenciales.
- Criterios de aceptación: una vez resuelta la autenticación real de servidor (Fase 0), este test se reescribe para pasar por el formulario de login real contra credenciales de prueba, sin atajos de `localStorage`.
- Depende de: `[SEC] Reemplazar autenticación client-side` (Fase 0).
- Referencias: `05-testing-qa.md` hallazgo #5.

---

### [QA] Agregar cobertura E2E para el sistema de Exportación
- Labels: testing, alpha-m2
- Severidad: Medio
- Archivos: `lib/utils/export-service.ts`, `components/ui/ExportMenu.tsx`
- Descripción: El sistema de exportación centralizado (PDF/Excel) no tiene ruta dedicada y no aparece como módulo propio en el último reporte E2E (`docs/sprint-11-1/e2e-modules-report.json`) — no hay evidencia de que algún test dispare o verifique este flujo.
- Criterios de aceptación: al menos un test que dispare una exportación desde un módulo (ej. Clientes) y verifique que el archivo generado tiene el contenido esperado.
- Referencias: `05-testing-qa.md` hallazgo #6.

---

### [QA] Priorizar cobertura automatizada de Tareas y Permisos
- Labels: testing, alpha-m2
- Severidad: Alto
- Archivos: `lib/auth/permissions.ts`, `app/tareas/*`
- Descripción: Tareas (con sus reglas de negocio explícitas de `AGENTS.md`) y la matriz de permisos (9 roles × 6+ módulos) no tienen ninguna cobertura automatizada — ni siquiera scripts ad hoc — pese a ser, según la revisión de seguridad, el punto más débil de aplicación de reglas.
- Criterios de aceptación: suite de pruebas (unitaria y/o E2E) que cubra explícitamente las reglas de `commitmentDate`/`reviewDate`, "nunca eliminar historial", y al menos los casos de permisos más críticos (qué rol puede eliminar qué).
- Referencias: `05-testing-qa.md` hallazgo #10, recomendación priorizada #2.

---

### [QA] Aislar credenciales y datos sintéticos de los scripts E2E de cualquier entorno compartido
- Labels: testing, alpha-m2, low-effort
- Severidad: Bajo
- Archivos: `scripts/e2e-login-crud-clientes.mjs:37`
- Descripción: El script hardcodea la password `"Temporal123"` e inyecta datos sintéticos con forma de PII (nombre, CURP, RFC, domicilio). Acepta overrides `E2E_BASE_URL`/`E2E_SUPABASE_BEARER`, así que apuntarlo a un proyecto de staging compartido sin limpieza visible podría contaminar datos compartidos.
- Criterios de aceptación: el script documenta explícitamente que solo debe correr contra un proyecto Supabase efímero/local, y limpia los datos sintéticos que crea al finalizar (teardown).
- Referencias: `05-testing-qa.md` hallazgo #11.
