# Fase 0 — Seguridad y Persistencia Real (Bloqueante de release)

Milestone de GitHub: **Alpha M0 — Seguridad y Persistencia Real (Bloqueante)**

Fuente: `docs/review-2026-08-11/02-seguridad.md`, `03-modelo-de-datos.md`, `06-recomendaciones.md`.

Cada issue abajo es una unidad de trabajo independiente para crear como GitHub Issue, asignada a este milestone. Usar el título exacto como título del issue.

---

### [SEC] Reemplazar autenticación client-side por autenticación real de servidor (Supabase Auth)
- Labels: security, blocker, alpha-m0
- Severidad: Crítico
- Archivos: `lib/auth/auth-service.ts` (hash `simpleHash` líneas 78-91, sesión `localStorage` líneas 243-263), `app/login/page.tsx`, `lib/supabase/client.ts`
- Descripción: Todo el ciclo de login/sesión/cambio de contraseña vive en `localStorage`. El hash de contraseña es un FNV-1a de 32 bits sin sal, no criptográfico. No hay ninguna llamada real a `supabase.auth.signInWithPassword` en el repo. Cualquier persona con DevTools puede escribir una sesión de administrador arbitraria sin conocer ninguna contraseña.
- Criterios de aceptación:
  - El login llama a `supabase.auth.signInWithPassword` (o flujo equivalente de servidor) en vez de comparar hashes en el cliente.
  - `simpleHash()`/`hashPassword()` se eliminan del código de producción.
  - La sesión se gestiona vía el mecanismo de Supabase Auth (cookies/JWT), no como JSON plano en `localStorage`.
  - Verificado contra un proyecto Supabase real (no el bearer de desarrollo restringido a localhost).
- Referencias: `02-seguridad.md` hallazgos #1 y #4.

---

### [SEC] Agregar protección de rutas server-side (middleware.ts o verificación en Server Components)
- Labels: security, blocker, alpha-m0
- Severidad: Crítico
- Archivos: (nuevo) `middleware.ts`, `components/auth/AppRouteGuard.tsx`, `app/layout.tsx`
- Descripción: No existe `middleware.ts` en el proyecto. La única barrera de acceso es `AppRouteGuard`, un componente `"use client"` que decide después de la hidratación — el bundle completo ya se descargó antes de esa decisión.
- Criterios de aceptación:
  - `middleware.ts` (o verificación equivalente en Server Components) redirige a `/login` antes de renderizar cualquier página protegida, sin depender de JS del cliente.
  - `AppRouteGuard` se mantiene como capa adicional de UX (evitar parpadeo de contenido), no como única barrera de seguridad.
- Depende de: issue de autenticación real de servidor (arriba) — necesita una sesión verificable server-side.
- Referencias: `02-seguridad.md` hallazgo #1.

---

### [SEC] Diseñar políticas RLS con scoping real por rol/proyecto (reemplazar `using (true)`)
- Labels: security, blocker, alpha-m0, database
- Severidad: Crítico
- Archivos: `supabase/migrations/202607270004_rls_initial.sql`, `202607270005_resources_table.sql`, `202607270006_core_grants_authenticated.sql`
- Descripción: Las 17 tablas de `core.*` tienen políticas `using (true)` / `with check (true)` para SELECT/INSERT/UPDATE/DELETE al rol `authenticated` — cualquier sesión autenticada tiene control total sobre todos los datos de todos los clientes.
- Criterios de aceptación:
  - Nueva migración reemplaza las políticas `using(true)` por políticas con scoping real (por rol, por pertenencia a proyecto vía `project_members`, etc.), usando `lib/auth/permissions.ts` como borrador de la matriz de roles.
  - Incluye la tabla `resource_links` (no solo las 16 originales).
  - Se agregan pruebas de RLS (script o pgTAP) que verifiquen que un usuario sin acceso a un proyecto no puede leer/escribir sus filas.
- Referencias: `02-seguridad.md` hallazgo #3, `03-modelo-de-datos.md` hallazgo #6.

---

### [SEC] Sacar datos personales del equipo (CURP, RFC, domicilio) del bundle de cliente
- Labels: security, blocker, alpha-m0, privacy
- Severidad: Crítico
- Archivos: `lib/data/team.ts`
- Descripción: PII de colaboradores (CURP, RFC, domicilio, contacto de emergencia) viaja en el JavaScript servido a cualquier visitante, autenticado o no, porque es un array estático importado por componentes cliente.
- Criterios de aceptación:
  - Los campos de PII sensible se sirven solo vía API/Server Component autenticado y autorizado, no como array estático en un módulo importado por componentes cliente.
  - Verificado inspeccionando el bundle de producción (`next build` + análisis de chunks) para confirmar que CURP/RFC no aparecen en JS servido públicamente.
- Referencias: `06-recomendaciones.md`, bloqueante #4.

---

### [SEC] Confirmar y fijar `NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase` en producción
- Labels: security, blocker, alpha-m0, database
- Severidad: Crítico
- Archivos: `lib/supabase/data-source.ts`
- Descripción: El valor por defecto de la fuente de datos sigue siendo `localstorage`. Sin confirmación explícita del valor real en producción, los datos de negocio (clientes, proyectos, tareas) podrían estar viviendo únicamente en el navegador de cada usuario, sin persistencia de servidor ni colaboración multiusuario real.
- Criterios de aceptación:
  - Se confirma y documenta el valor real de la variable en cada ambiente (dev/staging/prod).
  - Se agrega un smoke test post-deploy que verifica que una escritura hecha por un usuario persiste en Supabase y es visible para otro usuario/sesión, no solo en el `localStorage` del navegador original.
- Referencias: `02-seguridad.md` hallazgo #10, `03-modelo-de-datos.md`, resumen ejecutivo hallazgo #1.

---

### [SEC] Mover lista de administradores por defecto a configuración
- Labels: security, alpha-m0, low-effort
- Severidad: Bajo
- Archivos: `lib/data/roles.ts:19` (`SYSTEM_ADMIN_MEMBER_EMAILS`), `lib/auth/auth-service.ts:141-162`
- Descripción: Un email real de un colaborador está hardcodeado como mecanismo de escalación automática a rol Administrador, visible en el código fuente. Los scripts E2E reutilizan ese mismo email con la contraseña fija `"Temporal123"`.
- Criterios de aceptación:
  - La lista de administradores por defecto se mueve a variable de entorno o configuración fuera del código fuente versionado.
  - Se confirma que la contraseña de test `"Temporal123"` nunca coincide con una credencial real usada en un ambiente con datos reales.
- Referencias: `02-seguridad.md` hallazgo #6.
