# Revisión en profundidad — Seguridad

Fecha: 2026-08-11
Rama revisada: `release/v1.0` (== `main`, HEAD `d7af1b3`)
Alcance: autenticación, control de acceso a rutas, sistema de permisos, RLS de Supabase, manejo de secretos, PII.

Esta es la sección con los hallazgos de mayor severidad de toda la revisión. Varios de estos riesgos ya fueron identificados por el propio equipo en `docs/auth-v1-technical-review.md` bajo "Riesgos conocidos" — se marca explícitamente cuando es el caso. Que estén documentados es una buena señal de honestidad técnica, pero no reduce su severidad de cara a un release `v1.0`.

## 1. [Crítico] Autenticación completamente client-side, sin backend real

`lib/auth/auth-service.ts` implementa todo el ciclo de vida de sesión (login, cambio de contraseña, logout) manipulando únicamente `localStorage`:

- La sesión (`cincel.auth.session.v1`) es un objeto JSON en `localStorage` (líneas 243-263, `getCurrentSession`).
- La lista de "usuarios" (`teamMembers`) también se lee/escribe en `localStorage` (líneas 93-117, `loadMembers`/`persistMembers`), con fallback al array estático `lib/data/team.ts` si no hay nada guardado.
- El hash de contraseña es una función FNV-1a hecha a mano, **sin sal**, no criptográfica (líneas 78-91, `simpleHash`/`hashPassword`):
  ```ts
  function simpleHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  ```
  Este algoritmo produce solo 32 bits de salida, es reversible por fuerza bruta en segundos y es trivialmente vulnerable a tablas arcoíris. No es un hash de contraseñas apto para ningún entorno con datos reales.
- No existe `middleware.ts` en el proyecto. El control de acceso a rutas depende enteramente de `components/auth/AppRouteGuard.tsx`, un componente cliente (`"use client"`) montado en `app/layout.tsx` que decide si renderiza el contenido según `resolveCurrentSessionAccess()` — es decir, la protección de rutas ocurre en el navegador, después de que el bundle ya se descargó.

**Ya conocido por el equipo:** `docs/auth-v1-technical-review.md:38-40` documenta exactamente esto: *"Seguridad de autenticación limitada por ser client-side y basada en localStorage"* y *"Hash de contraseña simplificado para V1 (no apto para producción)"*, con la recomendación explícita de migrar a "Auth.js + Prisma + PostgreSQL" en el siguiente sprint. No se encontró evidencia en el código o en el historial de que esa migración se haya ejecutado.

**Impacto concreto:** cualquier persona con acceso a las DevTools del navegador de un usuario ya logueado puede leer `localStorage.getItem('cincel.auth.session.v1')`, y **escribir** un objeto de sesión arbitrario (por ejemplo con `access: "Administrador"`) para escalar privilegios instantáneamente, sin necesidad de conocer ninguna contraseña. No hay ningún servidor que valide esa sesión.

**Recomendación:** priorizar la migración a autenticación real de servidor (Supabase Auth es la opción más directa dado que el resto de la infraestructura ya está en Supabase) antes de considerar el proyecto apto para producción con datos de clientes reales.

## 2. [Crítico] Autorización ("permisos") resuelta 100% en el cliente

`lib/auth/permissions.ts` (1238 líneas) calcula las capacidades de cada usuario (`resolveProjectsCapabilities`, `resolveClientsCapabilities`, etc.) combinando tablas estáticas por rol con overrides guardados en `localStorage` (`cincel.permissions.custom.v1`, líneas 757-779). Esto se usa para decidir qué botones mostrar/ocultar en la UI (confirmado su uso en `components/configuracion/PermissionsWorkspace.tsx`, `components/proyectos/ProjectsTable.tsx`, `app/clientes/page.tsx`, `app/equipo/page.tsx`, entre otros).

No se encontró ningún punto donde esta lógica de permisos se vuelva a evaluar en el servidor antes de escribir en Supabase — ni en los repositorios (`lib/repositories/*.ts`), ni en políticas RLS específicas por rol (ver hallazgo 3).

**Impacto concreto:** ocultar un botón de "Eliminar cliente" en la UI para el rol "Arquitecto Junior" no impide que ese mismo usuario llame directamente al cliente de Supabase (expuesto vía `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ambas públicas por diseño) para borrar el registro igualmente — la única barrera real sería RLS, y el hallazgo 3 muestra que RLS no está aplicando ninguna restricción por rol hoy.

**Recomendación:** una vez resuelto el hallazgo 1 (sesión real de servidor), diseñar políticas RLS que reflejen la matriz de roles que ya existe en `permissions.ts` — ese archivo es, de hecho, un buen punto de partida como especificación de las políticas que faltan.

## 3. [Crítico] Políticas RLS de Supabase sin ningún filtro (`USING (true)`)

`supabase/migrations/202607270004_rls_initial.sql` habilita RLS en las 16 tablas `core.*` y luego, mediante un bloque `DO $$` que itera sobre todas ellas, crea automáticamente:

```sql
create policy %I on core.%I for select to authenticated using (true);
create policy %I on core.%I for insert to authenticated with check (true);
create policy %I on core.%I for update to authenticated using (true) with check (true);
create policy %I on core.%I for delete to authenticated using (true);
```

Es decir: **cualquier usuario con el rol `authenticated` de Supabase puede leer, insertar, actualizar y borrar cualquier fila de cualquier tabla**, sin distinción de organización, proyecto asignado o rol. La tabla `resource_links` (migración `202607270005_resources_table.sql`, líneas 63-109) repite exactamente el mismo patrón. `supabase/migrations/202607270006_core_grants_authenticated.sql` refuerza esto a nivel de grants SQL (`grant select, insert, update, delete on all tables in schema core to authenticated, service_role`).

El propio `docs/sprint-11-1/integrity-rules.md:40-44` documenta esto como una decisión intencional para la primera fase ("Política inicial: lectura/escritura para rol autenticado... Políticas finas por módulo/rol se refinan en 11.2/11.3"), pero no se encontró evidencia de que ese refinamiento haya llegado a ejecutarse en las migraciones existentes al cierre de Sprint 11.

**Impacto concreto:** combinado con el hallazgo 1 (no hay establecimiento de sesión real de Supabase Auth en el código de login) y el hecho de que **no hay política `anon`** (correcto, "sin acceso anon" según el mismo doc), el riesgo activo depende de si/cuándo la app se conecta realmente a Supabase con `NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase`. El día que eso ocurra con las políticas actuales, cualquier cuenta autenticada (incluida una creada directamente en el panel de Supabase, fuera del flujo de la app) tendría control total sobre los datos de todos los clientes del despacho.

**Recomendación:** no activar `NEXT_PUBLIC_CINCEL_DATA_SOURCE=supabase` en ningún ambiente con datos reales hasta que existan políticas RLS con scoping real (por ejemplo, basadas en un claim de rol en el JWT, o en pertenencia a proyecto vía `project_members`).

## 4. [Alto] No se encontró ningún establecimiento real de sesión de Supabase Auth

Se buscó en todo el repositorio (`grep -rn "auth.signIn\|signInWithPassword\|supabase.auth"`) y no aparece ninguna llamada a la API de autenticación real de Supabase. `lib/supabase/client.ts` crea el cliente con `auth: { persistSession: false }` (línea 48) y el único mecanismo para adjuntar un token de autorización es un *bearer* de desarrollo (`resolveDevBearer()`, líneas 5-23) explícitamente restringido a `localhost`/`127.0.0.1` y deshabilitado en `NODE_ENV === "production"`.

Esto significa que, tal como está el código hoy, **no existe un camino de producción para que un usuario obtenga una sesión "authenticated" real de Supabase** — el login de la app (`lib/auth/auth-service.ts`) nunca llama a Supabase Auth. Si se activa el data source `"supabase"` en producción sin resolver esto, probablemente las peticiones se hagan con la anon key sin JWT de usuario, y (dado que no hay políticas para `anon`) todas las operaciones fallarían — o, peor, si en algún punto se decide dar de baja el chequeo y usar la *service role key* del lado del cliente para "que funcione", eso expondría control total de la base de datos a cualquier visitante.

**Recomendación:** antes de avanzar con el corte a Supabase, trazar explícitamente cómo un login exitoso en `auth-service.ts` termina en una sesión de Supabase Auth válida (`supabase.auth.signInWithPassword` o equivalente), y verificarlo con pruebas de extremo a extremo contra un proyecto Supabase real (no local con bearer de desarrollo).

## 5. Manejo de secretos: correcto

- `.gitignore` incluye `.env*` (línea 24-25) y no hay archivos `.env` trackeados (`git ls-files | grep -i '\.env'` no devuelve nada).
- `supabase/env.example` solo contiene nombres de variables, sin valores.
- No se encontraron *service role keys*, JWT secrets ni otros secretos hardcodeados en el árbol de trabajo actual. El único uso de `SUPABASE_SERVICE_ROLE_KEY` es en `scripts/health-check-authenticated.mjs:56-58`, leído correctamente desde variables de entorno, nunca hardcodeado.

Esto no es un hallazgo, es una confirmación de buena práctica.

## 6. [Bajo] Cuenta de administrador hardcodeada por email

`lib/data/roles.ts:19`:
```ts
export const SYSTEM_ADMIN_MEMBER_EMAILS = ["paul@cincel.mx"] as const;
```
`resolveAccess()` en `auth-service.ts:141-162` otorga automáticamente el rol `Administrador` a cualquier colaborador cuyo `institutionalEmail` coincida con esta lista, **independientemente de lo que diga su rol configurado**. Es un mecanismo de "cuenta de emergencia" razonable en un proyecto chico, pero: (a) vive como código fuente en vez de configuración/variable de entorno, (b) es un email real de un colaborador, visible en el repositorio para cualquiera con acceso al código, y (c) los scripts de E2E (`scripts/e2e-sprint11-modules-review.mjs:39-40`, `scripts/e2e-login-crud-clientes.mjs:36-37`) usan exactamente ese mismo email con la contraseña hardcodeada `"Temporal123"` para sembrar sesiones de prueba — si ese patrón de contraseña se reutiliza alguna vez para la cuenta real (no solo en datos de prueba locales), sería una credencial trivialmente adivinable para la cuenta con más privilegios del sistema.

**Recomendación:** mover la lista de administradores por defecto a configuración/variable de entorno, y asegurar que el password de test `"Temporal123"` nunca coincida con una credencial real usada en un ambiente con datos reales.

## 7. Formularios y validación

Se revisaron los flujos de login (`app/login/page.tsx`) y cambio de contraseña (`completeFirstAccessPasswordChange`/`changeCurrentUserPassword` en `auth-service.ts:438-527`):

- **Positivo:** hay validación de longitud mínima de contraseña (8 caracteres, líneas 459 y 507) y confirmación de contraseña coincidente.
- **[Bajo]** No hay rate limiting de intentos de login — al ser todo client-side, tampoco hay dónde aplicarlo hoy de forma efectiva (un rate limit en el cliente es trivialmente evitable). Este punto se resuelve como consecuencia natural de atacar el hallazgo 1.
- **[Informativo]** Los mensajes de error de login (`app/login/page.tsx:44-66`) no distinguen entre "el correo no existe" y "la contraseña es incorrecta" (ambos casos caen en el mismo `"Correo o contraseña incorrectos"` genérico) — buena práctica ya aplicada, evita enumeración de cuentas por mensaje de error.

## 8. Sistema de exportación (`jspdf`/`xlsx`)

`lib/utils/export-service.ts` es un renderer genérico: recibe `rows: TRow[]` ya provistas por el componente que lo invoca (`components/ui/ExportMenu.tsx`) y no vuelve a consultar Supabase de forma independiente ni con un alcance más amplio. Esto significa que el sistema de exportación **no introduce una fuga de datos adicional** más allá de la ya existente por el hallazgo 2 (permisos solo en UI): si el usuario ya puede ver ciertas filas en pantalla, puede exportarlas; no hay un camino donde exportar dé acceso a datos que la tabla en pantalla no mostraba.

## 9. [Alto] Datos personales reales de colaboradores hardcodeados en un archivo que llega al bundle de cliente

`lib/data/team.ts` (212 líneas) define `teamMembers: TeamMember[]`, un array estático con datos que tienen toda la apariencia de ser reales (no placeholders genéricos tipo "Juan Pérez"/"test@example.com"): nombre, fecha de nacimiento, nacionalidad, teléfono personal, `institutionalEmail`, domicilio completo, `personalEmail`, **CURP**, **RFC**, y un objeto `emergencyContact` con nombre, relación, teléfono y domicilio de un tercero (línea 13-21).

Este archivo se importa, directa o transitivamente, desde `lib/auth/auth-service.ts` (como *fallback* de `loadMembers()` cuando no hay nada aún en `localStorage`, líneas 93-101) y desde varios componentes `"use client"` (`components/layout/Header.tsx`, `components/proyectos/ProjectsTable.tsx`, `components/configuracion/PermissionsWorkspace.tsx`, `app/equipo/page.tsx`). Como `auth-service.ts` es usado por `app/login/page.tsx` (ruta pública, sin sesión), el árbol de dependencias de la página de login incluye este archivo — lo que en la práctica significa que estos datos personales completos de colaboradores reales viajan dentro del JavaScript que Next.js sirve al navegador, alcanzable por cualquier visitante, esté o no autenticado.

**Verificado:** no se encontraron valores `auth.passwordHash` reales en los objetos de `teamMembers` (el campo `auth` solo aparece en la definición de tipo, línea 28-29, no está poblado en los 7 registros de datos) — es decir, esto es exposición de PII, no una fuga de credenciales.

**Recomendación:** mover estos datos fuera del código fuente (a Supabase, ya que la tabla `core.team_members` ya existe para esto) y dejar en `lib/data/team.ts`, si acaso, únicamente datos de ejemplo ficticios para desarrollo local. Auditar también si el resto de módulos con datos mock en `lib/data/` (clientes, proyectos) tienen el mismo patrón.

## 10. XSS / inyección

No se encontró ningún uso de `dangerouslySetInnerHTML` en `app/`, `components/` ni `lib/`. React escapa por defecto el contenido interpolado en JSX, por lo que el riesgo de XSS reflejado vía datos de usuario (nombres de clientes, notas de actividades, etc.) es bajo con el código actual.
