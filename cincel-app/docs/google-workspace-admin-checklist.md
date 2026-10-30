# Checklist del administrador de Google Workspace

**Para:** el administrador de Google Workspace de Cincel (lado cliente).
**Objetivo:** dejar listo Google Workspace y Google Cloud para que el equipo entre a Cincel con **Entrar con Google**.
**Referencia técnica:** `docs/specs/backend.md` §A.2, §A.9 (fase: `docs/phases/staff-sso-phase-1-google-sign-in-gate.md`).

Esta configuración se hace **una sola vez**, en la consola de Google Cloud y en la consola de administración de Google
Workspace. Sin ella no se puede verificar el inicio de sesión con Google, ni en staging ni en producción.

Cómo funciona, en corto:

- Solo entran cuentas del dominio de la empresa (cliente OAuth **Interno**).
- Los **grupos de Workspace** deciden quién entra, con qué rol y en qué áreas. Nadie se da de alta a mano en Cincel.
- Una **cuenta de servicio** lee usuarios y grupos (solo lectura) y crea las carpetas de los proyectos en la unidad
  compartida. **No se usa delegación de todo el dominio.**

---

## 1. Proyecto de Google Cloud y APIs

- [ ] Crear el proyecto de Cloud **"Cincel"** dentro de la organización de la empresa.
- [ ] Habilitar **Admin SDK API**.
- [ ] Habilitar **Google Drive API**.
- [ ] Habilitar **Google Calendar API** (para la sincronización de calendario).

## 2. Pantalla de consentimiento OAuth

- [ ] Tipo de usuario: **Interno**. Así una cuenta personal de Gmail no puede completar el inicio de sesión.
- [ ] Permisos (scopes) que pide la app:
  - Inicio de sesión: `openid`, `email`, `profile`.
  - Drive (se pide aparte, la primera vez que alguien abre archivos): `https://www.googleapis.com/auth/drive.readonly`.
  - Calendario (se pide aparte, al activar la sincronización): `https://www.googleapis.com/auth/calendar.app.created`.

## 3. Cliente OAuth "Cincel Staff"

- [ ] Crear un cliente OAuth de tipo **Aplicación web**, uno por ambiente (producción y staging).
- [ ] URI de redirección autorizado de cada uno: `<APP_ORIGIN>/api/auth/google/callback`, donde `<APP_ORIGIN>` es la
      dirección pública de ese ambiente (por ejemplo `https://<dominio de producción>` y `https://<dominio de staging>`).
- [ ] Guardar el **ID de cliente** y el **secreto de cliente** de cada ambiente para enviarlos (paso 9).

## 4. Cuenta de servicio `cincel-directory`

- [ ] Crear la cuenta de servicio `cincel-directory` en el proyecto "Cincel".
- [ ] Generar una **clave JSON**. Enviarla por un canal seguro (paso 9); nunca por correo sin cifrar ni en un chat
      abierto.

## 5. Rol de administrador personalizado "Cincel directory reader"

En la consola de administración de Workspace (**Cuenta → Roles de administrador**):

- [ ] Crear el rol personalizado **"Cincel directory reader"** con solo estos privilegios de la API de administración:
  - **Usuarios → Leer**
  - **Grupos → Leer**
- [ ] Asignar el rol a la cuenta de servicio `cincel-directory` (por su correo `…@….iam.gserviceaccount.com`).

## 6. Grupos

Los grupos deciden el rol de cada persona. Si alguien está en varios grupos de rol, gana el de mayor rango.

- [ ] Crear los 8 grupos de rol:

  | Grupo                                 | Rol en Cincel             | Rango |
  | ------------------------------------- | ------------------------- | ----- |
  | `cincel-administradores@<dominio>`    | Administrador             | 80    |
  | `cincel-direccion@<dominio>`          | Dirección                 | 70    |
  | `cincel-jefes-taller@<dominio>`       | Jefe de Taller            | 60    |
  | `cincel-jefes-construccion@<dominio>` | Jefe de Construcción      | 50    |
  | `cincel-arquitectos-senior@<dominio>` | Arquitecto Senior         | 40    |
  | `cincel-arquitectos-junior@<dominio>` | Arquitecto Junior         | 30    |
  | `cincel-colaboradores@<dominio>`      | Colaborador               | 20    |
  | `cincel-pasantes@<dominio>`           | Pasante / Servicio Social | 10    |

  El rol **Otros** no tiene grupo. Una persona que no está en ningún grupo de rol no puede entrar a Cincel.

- [ ] Crear un grupo de área por cada área de Cincel: `cincel-area-<slug>@<dominio>` (por ejemplo
      `cincel-area-construccion@<dominio>`).
- [ ] Crear `cincel-todos@<dominio>` y agregar como miembros los 8 grupos de rol.
- [ ] Agregar a cada persona del equipo a su grupo de rol y a los grupos de sus áreas.

## 7. Unidad compartida "Cincel Proyectos"

- [ ] Crear la unidad compartida **"Cincel Proyectos"**.
- [ ] Miembros:
  - `cincel-todos@<dominio>` como **Administrador de contenido**.
  - La cuenta de servicio `cincel-directory` como **Administrador de contenido**.
- [ ] Anotar el **ID de la unidad compartida** (la última parte de su URL en Drive).

## 8. Quitar la delegación de todo el dominio

- [ ] En **Seguridad → Acceso y control de datos → Controles de API → Delegación de todo el dominio**, eliminar la
      autorización que tenga hoy la cuenta de servicio de Cincel. La nueva versión ya no la usa.

## 9. Enviar a Cincel

Por un canal seguro (gestor de contraseñas compartido o similar):

- [ ] Dominio de Workspace (por ejemplo `cincel.mx`).
- [ ] ID y secreto del cliente OAuth de cada ambiente.
- [ ] Clave JSON de la cuenta de servicio.
- [ ] Correos de los grupos (rol, área y `cincel-todos`).
- [ ] ID de la unidad compartida.

---

## Staging

Antes de activar en producción, staging debe tener en su lugar:

- [ ] Su cliente OAuth con el URI de redirección de staging (paso 3).
- [ ] La cuenta de servicio con su clave y el rol "Cincel directory reader" (pasos 4 y 5).
- [ ] Los grupos con al menos una cuenta de prueba en un grupo de rol y una de área (paso 6).

### Verificación manual en staging

Con `AUTH_GOOGLE_ENABLED=true` en staging:

- [ ] **Permitido:** una cuenta del dominio en `cincel-arquitectos-senior` y `cincel-area-construccion` entra con
      **Entrar con Google** y queda como Arquitecto Senior, área Construcción, y ve todos los proyectos.
- [ ] **Negado, sin grupo de rol:** una cuenta del dominio que no está en ningún grupo de rol llega a "Tu cuenta no
      tiene acceso a Cincel" y no se crea sesión.
- [ ] **Negado, Gmail personal:** una cuenta personal de Gmail no puede completar el inicio de sesión.
- [ ] **Negado, suspendida:** una cuenta suspendida en Workspace no puede entrar.

Los resultados se registran como comentario en el issue #532.
