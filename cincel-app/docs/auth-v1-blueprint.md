# Blueprint tecnico de autenticacion V1

## Objetivo
Definir la base funcional y tecnica para implementar la interfaz de autenticacion en V1 con persistencia localStorage, manteniendo migracion futura a PostgreSQL + Prisma + Auth.js.

## Decisiones cerradas de producto
1. Separar estado del colaborador y estado del acceso.
2. Politica de contrasena inicial: minimo 8 caracteres.
3. Tras cambio obligatorio de contrasena, mantener sesion activa y redirigir a Dashboard.
4. Reactivar colaborador no resetea contrasena automaticamente.
5. Agregar bandera Tiene acceso al sistema para permitir colaboradores sin login.

## Modelo de dominio V1

### Estados
Estado del colaborador
- Activo
- Inactivo

Estado del acceso
- Sin acceso
- Pendiente de primer acceso
- Acceso activo

### Propuesta de estructura auth en TeamMember
Campo actual: auth opcional.
Propuesta V1:
- hasSystemAccess: boolean
- accessStatus: no_access | pending_first_access | active
- mustChangePassword: boolean
- passwordHash: string
- passwordUpdatedAt: string | null
- lastLoginAt: string | null

Notas
- active se mantiene como estado laboral del colaborador.
- hasSystemAccess y accessStatus controlan login.
- mustChangePassword controla redireccion forzada al flujo de cambio obligatorio.
- authEnabled puede retirarse gradualmente para evitar duplicidad semantica con hasSystemAccess.

## Reglas de negocio
1. Si active es false, login bloqueado siempre.
2. Si hasSystemAccess es false, login bloqueado siempre.
3. Si accessStatus es no_access, login bloqueado.
4. Si accessStatus es pending_first_access y credenciales validas, permitir solo pantalla de cambio obligatorio.
5. Si accessStatus es active y credenciales validas, acceso normal al ERP.
6. Email institucional es identificador unico normalizado (trim + lowercase).
7. No existe recuperacion por correo en V1.
8. Si Admin hace reset manual de contrasena:
- accessStatus vuelve a pending_first_access.
- mustChangePassword = true.

## Pantallas y flujo UX

### 1) Equipo - Formulario crear/editar colaborador
Ubicacion
- Vista actual de Equipo (modal o drawer existente).

Nuevos campos en seccion de acceso
- Tiene acceso al sistema (switch: Si/No).
- Contrasena temporal (solo visible si Tiene acceso al sistema = Si).
- Confirmar contrasena temporal (solo visible si Tiene acceso al sistema = Si).
- Estado del acceso (solo lectura, calculado):
  - Sin acceso cuando switch = No.
  - Pendiente de primer acceso cuando switch = Si y contrasena temporal valida.

Validaciones
- Si Tiene acceso al sistema = Si:
  - Correo institucional obligatorio y unico.
  - Contrasena temporal obligatoria, minimo 8.
  - Confirmacion igual a contrasena temporal.
- Si Tiene acceso al sistema = No:
  - Ocultar campos de contrasena.
  - Guardar estado de acceso en no_access.

Comportamiento al guardar
- Switch No:
  - hasSystemAccess = false
  - accessStatus = no_access
  - mustChangePassword = false
  - passwordHash = ""
- Switch Si:
  - hasSystemAccess = true
  - accessStatus = pending_first_access
  - mustChangePassword = true
  - passwordHash = hash(contrasena temporal)
  - passwordUpdatedAt = null
  - lastLoginAt = null

### 2) Login
Ruta sugerida
- /login

Campos
- Correo institucional
- Contrasena
- Boton Iniciar sesion

Estados de error
- Credenciales invalidas
- Cuenta inactiva
- Cuenta sin acceso al sistema
- Contrasena no configurada
- Acceso no permitido para tipo Cliente

Exito
- Si mustChangePassword = true o accessStatus = pending_first_access:
  - Crear sesion
  - Redirigir a /auth/primer-acceso
- Si accessStatus = active:
  - Crear sesion
  - Redirigir a /dashboard

### 3) Cambio obligatorio de contrasena (primer acceso)
Ruta sugerida
- /auth/primer-acceso

Guard de ruta
- Requiere sesion activa.
- Requiere estado pending_first_access o mustChangePassword true.
- Si no cumple, redirigir a /dashboard.

Campos
- Nueva contrasena
- Confirmar nueva contrasena

Validaciones
- Minimo 8 caracteres.
- Confirmacion coincide.
- Diferente a vacio.

Exito
- Actualizar hash.
- mustChangePassword = false.
- accessStatus = active.
- passwordUpdatedAt = now.
- Mantener sesion activa.
- Redirigir a /dashboard.

### 4) Mi perfil - Cambiar contrasena
Ruta sugerida
- /perfil o seccion Perfil del usuario autenticado

Campos
- Contrasena actual
- Nueva contrasena
- Confirmar nueva contrasena

Validaciones
- Contrasena actual correcta.
- Nueva minimo 8.
- Nueva y confirmacion coinciden.

Exito
- Actualizar hash.
- passwordUpdatedAt = now.
- Mantener sesion activa.

### 5) Comportamiento al desactivar colaborador
Ubicacion
- Equipo, accion cambiar activo/inactivo.

Efectos
- Login bloqueado inmediatamente para nuevos intentos.
- Sesion existente invalida en proxima validacion de guard (getCurrentAuthenticatedUser).
- Mensaje: cuenta inactiva, contactar administrador.

### 6) Reactivacion
Regla
- Reactivar no cambia contrasena por defecto.

Accion separada de Admin
- Restablecer contrasena manualmente.

Efectos del restablecimiento
- hasSystemAccess = true.
- accessStatus = pending_first_access.
- mustChangePassword = true.
- passwordHash = hash(nueva temporal).

## Contratos del servicio de autenticacion
Archivo objetivo
- lib/auth/auth-service.ts

Tipos sugeridos
- AuthAccessStatus = no_access | pending_first_access | active
- AuthFailureReason =
  - invalid_credentials
  - inactive_member
  - no_system_access
  - access_not_allowed
  - password_not_set
  - first_access_required

Sesion
- AuthSession
  - collaboratorId: number
  - email: string
  - access: SystemAccessRole
  - loggedAt: string

### API de dominio propuesta
1. normalizeEmail(email: string): string
2. getCurrentSession(): AuthSession | null
3. getCurrentAuthenticatedUser(): AuthenticatedUser | null
4. loginWithEmailAndPassword(input)
- input: { email: string; password: string }
- output success: { ok: true; session: AuthSession; requiresPasswordChange: boolean }
- output error: { ok: false; reason: AuthFailureReason }
5. completeFirstAccessPasswordChange(input)
- input: { collaboratorId: number; newPassword: string; confirmPassword: string }
- output: { ok: true } | { ok: false; reason: string }
6. changeOwnPassword(input)
- input: { collaboratorId: number; currentPassword: string; newPassword: string; confirmPassword: string }
- output: { ok: true } | { ok: false; reason: string }
7. adminSetTemporaryPassword(input)
- input: { collaboratorId: number; temporaryPassword: string }
- output: { ok: true } | { ok: false; reason: string }
8. setCollaboratorSystemAccess(input)
- input: { collaboratorId: number; hasSystemAccess: boolean }
- output: { ok: true } | { ok: false; reason: string }
9. logout(): void

## Contratos UI -> servicio por pantalla

Equipo
- Alta/edicion con switch Tiene acceso al sistema:
  - Si switch = Si, invocar adminSetTemporaryPassword despues de guardar miembro.
  - Si switch = No, invocar setCollaboratorSystemAccess false.

Login
- Submit invoca loginWithEmailAndPassword.
- Si requiresPasswordChange true, navegar a /auth/primer-acceso.
- Si false, navegar a /dashboard.

Primer acceso
- Submit invoca completeFirstAccessPasswordChange.
- En success navegar a /dashboard sin cerrar sesion.

Perfil
- Submit invoca changeOwnPassword.

## Guards de navegacion
1. Guard de app privada
- Si no hay sesion valida, redirigir a /login.
- Si cuenta inactiva o sin acceso, limpiar sesion y redirigir /login.

2. Guard de primer acceso
- Si requiere cambio obligatorio, bloquear acceso al resto de rutas privadas y forzar /auth/primer-acceso.

## Storage keys V1
- cincel.team.members.v1
- cincel.team.system-roles.v1
- cincel.auth.session.v1

## Migracion de datos legacy (client-side)
Al cargar miembros persistidos, normalizar auth si faltan campos.
Reglas de normalizacion sugeridas
- Si auth no existe:
  - hasSystemAccess = false
  - accessStatus = no_access
  - mustChangePassword = false
- Si auth existe y passwordHash no vacio:
  - hasSystemAccess = true
  - accessStatus = active (salvo bandera explicita de primer acceso)

## Matriz de aceptacion funcional
1. Admin crea colaborador con switch No
- No puede iniciar sesion.
- Colaborador usable en modulos de negocio.

2. Admin crea colaborador con switch Si + temporal valida
- Queda en pending_first_access.
- Login redirige a cambio obligatorio.

3. Cambio obligatorio exitoso
- Sesion sigue activa.
- Redirige a Dashboard.

4. Cambio de contrasena en perfil
- Requiere contrasena actual.
- Mantiene sesion.

5. Desactivacion
- Bloquea nuevos logins.
- Invalida sesion activa en siguiente guard.

6. Reactivacion sin reset
- Mantiene contrasena previa.
- No vuelve a pending_first_access.

7. Reset manual por Admin
- Vuelve a pending_first_access.
- Exige cambio obligatorio en siguiente login.

## Orden recomendado de implementacion (UI)
1. Extender modelo auth en TeamMember + normalizador legacy.
2. Completar contratos en auth-service.
3. Integrar switch Tiene acceso al sistema y temporal en Equipo.
4. Implementar /login.
5. Implementar /auth/primer-acceso.
6. Agregar cambio de contrasena en Perfil.
7. Agregar guards de navegacion y redirecciones.
8. Ejecutar QA de matriz funcional completa.

## Estado implementado (julio 2026)

### Arquitectura actual de autenticacion
- La autenticacion se centraliza en `lib/auth/auth-service.ts`.
- `auth-service` encapsula:
  - lectura/escritura de sesion (`cincel.auth.session.v1`),
  - lectura/escritura de miembros (`cincel.team.members.v1`),
  - validacion de acceso,
  - hash/verificacion de contrasena,
  - cambio de contrasena obligatorio y voluntario.
- El guard global de rutas vive en `components/auth/AppRouteGuard.tsx` y se aplica desde `app/layout.tsx`.

### Flujo de primer acceso
- Alta/edicion en Equipo con acceso activo + contrasena temporal.
- Login exitoso con estado pendiente dirige a `/change-password`.
- Cambio obligatorio exitoso:
  - actualiza hash,
  - marca acceso como activo,
  - mantiene sesion,
  - redirige a `/dashboard`.

### Flujo de cambio de contrasena voluntario
- Se ejecuta en `/profile`.
- Requiere contrasena actual valida.
- Actualiza `passwordUpdatedAt` sin cerrar sesion.

### Estados del colaborador
- `active = true`: colaborador habilitado laboralmente.
- `active = false`: colaborador inactivo; se bloquea login.

### Estados del acceso
- `Sin acceso al sistema`.
- `Sin contrasena temporal`.
- `Pendiente de primer acceso`.
- `Acceso activo`.

### Guards implementados
- Guard global en layout:
  - Si no hay sesion valida, redirige a `/login`.
  - Si estado es pendiente de primer acceso, fuerza `/change-password`.
  - Si estado es activo, permite rutas privadas.
  - Si la ruta publica es `/login` y ya hay sesion activa, redirige a `/dashboard`.

### Responsabilidades de authService
- Normalizar identidad (`normalizeEmail`).
- Resolver sesion y acceso (`getCurrentSession`, `getCurrentAuthenticatedUser`, `resolveCurrentSessionAccess`).
- Login (`loginWithEmailAndPassword`).
- Cambio obligatorio de primer acceso (`completeFirstAccessPasswordChange`).
- Cambio voluntario (`changeCurrentUserPassword`).
- Operaciones administrativas de acceso (`setCollaboratorSystemAccess`, `setCollaboratorTemporaryPassword`, `setCollaboratorPassword`).
- Logout (`logout`).

### Limitaciones conocidas (localStorage)
- No hay seguridad criptografica de servidor; el hash actual es simplificado para V1.
- La validacion de auth es client-side (adecuada para sprint funcional, no para produccion).
- Otros modulos del ERP aun usan localStorage directamente para datos no-auth.
- La persistencia local puede variar entre navegadores/perfiles y no ofrece auditoria central.
