# Auth V1 - Revision tecnica de cierre de sprint

Fecha: 2026-07-22

## Alcance
Revision del modulo de autenticacion V1 para limpieza tecnica, consistencia de arquitectura y cobertura de guards.

## Resultado general
Aprobado funcionalmente con limpieza aplicada en guards y documentacion actualizada.

## Limpieza tecnica ejecutada
- Se elimino duplicacion de validacion de rutas en paginas auth y privadas.
- Se centralizo la decision de acceso de sesion en `resolveCurrentSessionAccess` dentro de `lib/auth/auth-service.ts`.
- Se agrego guard global `components/auth/AppRouteGuard.tsx` aplicado desde `app/layout.tsx`.
- Se removio estado no usado `notice` en Login.
- Se confirmo ausencia de `TODO`, `FIXME`, `console.*` en `app`, `components` y `lib` para el modulo revisado.

## Confirmaciones de arquitectura
- La autenticacion permanece centralizada en `lib/auth/auth-service.ts`.
- La sesion de autenticacion (`cincel.auth.session.v1`) solo se manipula desde `auth-service`.
- Las rutas privadas quedan cubiertas por un guard global y ya no dependen solo de guards locales.
- El codigo conserva separacion de dominio que facilita migracion futura a PostgreSQL + Prisma + Auth.js.

## Cobertura de rutas (reglas de acceso)
- Sin sesion: acceso a rutas privadas redirige a `/login`.
- Sesion activa: acceso permitido a rutas privadas.
- Pendiente de primer acceso: redireccion forzada a `/change-password`.
- Inactivo/sin acceso: bloqueo y redireccion a `/login`.

## Persistencia
- La sesion y el estado auth del colaborador persisten en localStorage via `auth-service`.
- Recarga completa mantiene consistencia de flujo segun estado de sesion/acceso.

## Hallazgos fuera de auth (deuda existente)
- `app/proyectos/[id]/ficha/page.tsx` tiene errores de lint preexistentes de hooks (`react-hooks/rules-of-hooks`, `react-hooks/set-state-in-effect`).
- `components/layout/Header.tsx` mantiene warning de performance por uso de `img` en lugar de `next/image`.

## Riesgos conocidos
- Seguridad de autenticacion limitada por ser client-side y basada en localStorage.
- Hash de contrasena simplificado para V1 (no apto para produccion).
- Persistencia distribuida en cliente sin trazabilidad central.

## Recomendaciones para siguiente sprint
1. Migrar sesion y credenciales a backend (Auth.js + Prisma + PostgreSQL).
2. Sustituir hash simplificado por estrategia robusta de servidor.
3. Introducir middleware/validacion server-side para rutas privadas.
4. Resolver deuda de hooks en `app/proyectos/[id]/ficha/page.tsx`.
5. Estandarizar acceso a persistencia por servicios de dominio tambien para modulos no-auth.
