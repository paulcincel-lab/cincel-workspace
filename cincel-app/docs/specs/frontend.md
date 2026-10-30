# Spec: Staff Google Sign-in + Client Portal (Frontend)

**Status:** Ready for review · **Owner:** Oscar · **Date:** 2026-10-28
**Companion:** `docs/specs/backend.md`. Decisions, data model and server behavior are there; this file covers screens, components, states and the contract the UI calls.

Conventions (from `AGENTS.md` and the existing app): Next.js App Router, React 19, TypeScript, Tailwind 4, plain shadcn/ui components and variants in `components/ui/shadcn` (no custom-colored wrappers), monochrome palette (color only for status), drawers for editing, existing `AppAvatar`, `Badge`, `DataTable` and layout components. All UI copy is Spanish (Mexico). Types live in `lib/types/`. The app has no toast library: feedback is inline (an `Alert` near the action, or a status line), not toasts.

---

## 1. Goals

- Staff: sign in with Google, see why they were refused, browse a project's Drive folder, and manage which clients see a project.
- Admins: map Workspace groups to roles and areas, check Google health, re-check a person's access, create missing project folders.
- Clients: sign in with an emailed code on a phone, see their projects, cronograma summary and files, and send files.

### Non-goals (v1)
- Uploading or editing Drive files from the staff UI.
- Client messaging, approvals, branding, Google sign-in for clients.

---

## 2. Staff screens

### 2.1 `/login` (existing page, changed)
- With `AUTH_GOOGLE_ENABLED`: a primary `Button` **Entrar con Google** (Google "G" icon from `lucide`-compatible inline SVG) linking to `/api/auth/google/start`.
- With `AUTH_PASSWORD_ENABLED`: the current email/password form stays below a `Separator` labeled "o con contraseña". Without it, the form isn't rendered.
- The flags reach the page as server props (read in the server component), never `NEXT_PUBLIC_*`.
- Errors from the callback arrive as `?error=` and show in an `Alert`: `state` ("La sesión de inicio expiró. Intenta de nuevo."), `retry` ("No pudimos verificar tu acceso con Google. Intenta de nuevo.").

### 2.2 `/login/denegado` (new, public)
- Card with a title and a message per `motivo`:
  - `no_role_group`: "Tu cuenta no tiene acceso a Cincel. Pide a tu administrador de Google Workspace que te agregue a un grupo de Cincel."
  - `workspace_suspended` / `workspace_deleted`: "Tu cuenta de Google Workspace está suspendida."
  - `domain`: "Usa tu cuenta de la empresa (@{dominio})."
  - `inactive`: "Tu usuario está desactivado en Cincel."
  - `sub_mismatch`: "Esta cuenta de Google no coincide con tu usuario. Contacta al administrador."
  - `needs_link`: "Tu usuario de Cincel no tiene este correo. Pide a un administrador que registre {email} en tu ficha de Equipo."
  - `revoked`: "Tu acceso a Cincel fue retirado en Google Workspace."
  - Unknown or missing `motivo`: the `no_role_group` text.
- Button **Volver a intentar** → `/login`. Public in both `middleware.ts` and `AppRouteGuard` (backend §A.5.1). The page never reads the staff session, so a stale cookie can't bounce it.

### 2.3 Project pages: `/proyectos/[id]/archivos` (new)
- Sits next to `ficha` and `cronograma`. There's no shared project nav today, so add `components/proyectos/ProjectSectionNav.tsx` (shadcn `Tabs` rendered as links: Ficha · Cronograma · Archivos · Clientes; Clientes only with `portal.manageAccess`) and use it at the top of all four pages.
- States:
  - Folder `pending`: "Creando la carpeta del proyecto…" + **Reintentar carpeta** for users with the projects capability `canEditProjectGeneral`.
  - Folder `failed`: `Alert` with the error and **Reintentar carpeta** (`retryProjectFolderAction`).
  - No Drive grant: **Conectar Google Drive** → `/api/auth/google/start?scope=drive&return_to=/proyectos/[id]/archivos`.
  - `no_drive_access`: "No tienes acceso a esta carpeta en Drive."
  - Ready: breadcrumbs (`Breadcrumb`), table (`DataTable`) of name with icon, modified date, size; folders navigate (`?folder=`), files open `webViewLink` in a new tab. Header link **Abrir en Drive** to the project folder.
- The three subfolders show a one-line hint: `01 Interno` "Solo el equipo", `02 Cliente` "Lo ven los clientes invitados", `03 Del cliente` "Archivos que envían los clientes".

### 2.4 Project pages: `/proyectos/[id]/clientes` (new; permission `portal.manageAccess`)
- Without the permission the link is hidden and the page returns the existing "sin permiso" state.
- Hint `Alert`: "Todo lo que pongas en 02 Cliente lo verán los clientes invitados a este proyecto." + link **Abrir carpeta del cliente en Drive**.
- Table: nombre, correo, contacto, estado (`Badge`: Invitado / Activo / Deshabilitado / Sin acceso), invitado por, último acceso. Row actions (`DropdownMenu`): **Reenviar invitación**, **Quitar acceso**, **Deshabilitar** (only with `portal.disableUsers`). Destructive actions confirm in an `AlertDialog`.
- **Invitar cliente** opens a `Sheet` (drawer):
  - Contact `Combobox` limited to the project's client and its `project_contacts` of type `cliente` / `socio`.
  - Email (prefilled from the contact if present) and name (prefilled).
  - A `socio` shows a warning `Alert` and requires a checkbox "Entiendo que es un socio, no el cliente".
  - Server errors inline (codes below).
  - Success (inline in the sheet, then it closes): "Invitación enviada" or, when `emailSent` is false, "Se dio acceso pero el correo no salió. Usa Reenviar invitación."
- Error codes → copy: `staff_domain` "Este correo es de tu equipo; usa el acceso con Google." · `disabled` "Este cliente está deshabilitado." · `already_active` "Este cliente ya tiene acceso a este proyecto." · `not_project_contact` "El contacto no pertenece a este proyecto." · `socio_unconfirmed` (shows the socio checkbox) · `invalid_email` "Correo inválido." · `rate_limited` "Ya reenviaste esta invitación varias veces; espera una hora." · `forbidden` "No tienes permiso."
- Disabled users show **Habilitar** (with `portal.disableUsers`) instead of **Deshabilitar**.
- **Actividad** card: last 50 portal file events (cliente, archivo, acción, fecha).

### 2.5 Configuración → **Google** (`/configuracion/google`, new; Administrador only, like every `/configuracion` page)
Sections, in order:
1. **Estado:** service account email, Shared Drive ID, token key configured (yes/no), last Directory error, last Drive error, and "N de M colaboradores activos ya entraron con Google".
2. **Grupos de Google:** table of mappings (grupo, tipo Rol/Área, valor, rango). **Agregar grupo** `Sheet`: group email, type (`Select`), role (`Select` of `OFFICIAL_CINCEL_ROLES`) or area (`Select` of areas), rank (number, role only). Errors: "El grupo no existe", duplicate. Edit and delete from the row menu.
3. **Carpetas de proyectos:** **Crear carpetas faltantes** with a result summary ("12 creadas, 1 con error").
- Banner at top: "Los roles y las áreas se administran en grupos de Google Workspace."

### 2.6 Equipo and Áreas (existing, changed)
- For staff with `googleManaged: true`: role and area fields are read-only with a `Badge` "Google Workspace" and a tooltip "Se administra en Google Workspace". Other fields stay editable.
- Staff detail adds **Revisar acceso ahora** (Administrador only) with the result inline ("Acceso confirmado" / "Acceso retirado: {motivo}" / "No pudimos consultar Google; intenta más tarde").
- Staff list shows "Último acceso" and, when revoked, a `Badge` "Sin acceso".

### 2.7 Recursos picker and Calendario (existing, changed)
- The Drive picker reads `GET /api/google/drive/status` (`{ configured, mode, hasDriveGrant, googleLinked }`). With `mode = "delegation"` (flag off) it behaves exactly as today. With `mode = "staff_token"`: no grant → **Conectar Google Drive** instead of the old "Conectar cuenta de Google", and a 403 `needs_consent` from any picker route shows the same button; the account switcher UI is hidden.
- Calendar sync's connect button goes to `/api/auth/google/start?scope=calendar&return_to=/calendario`.

---

## 3. Portal screens (`/portal`, Spanish, mobile-first)

Layout `app/portal/layout.tsx`: its own minimal shell (logo, client name, **Salir**), not the staff sidebar or header. Max width `max-w-3xl`, single column on phones. Loaded with `requirePortalUser()` except `/portal/login`.

### 3.1 `/portal/login`
- Step 1: email `Input` (prefilled from `?email=`), **Enviarme un código**. Always shows "Si tu correo tiene acceso, te enviamos un código." then step 2.
- Step 2: 6-digit `InputOTP` (paste-friendly, `inputMode="numeric"`, `autoComplete="one-time-code"`), **Entrar**, **Reenviar código** (disabled 60 s with a countdown), **Cambiar correo**.
- Errors: 400 `invalid_code` → "Código inválido o vencido. Pide uno nuevo."; 429 `rate_limited` → "Demasiados intentos. Espera unos minutos."
- Success → `/portal`.

### 3.2 `/portal`
- Cards per project: name, code, progress (`Progress`), end date, manager name + mailto link.
- Empty: "No tienes proyectos activos. Si crees que es un error, contacta a tu equipo de Cincel."

### 3.3 `/portal/proyectos/[id]`
`Tabs` (state in `?tab=`):
- **Resumen:** status `Badge`, progress, start/end dates, address, manager contact.
- **Cronograma:** read-only list grouped by `planta`, one row per section: name, dates, `Progress`. Built from `PortalScheduleDTO` only. Reuses the cronograma's presentational pieces where they accept plain props; never imports the staff cronograma data hooks. Empty: "El cronograma aún no está disponible."
- **Archivos:** breadcrumbs + list (icon, name, modified, size). Folders navigate. Files: **Descargar** (always), **Ver** (PDF and images; opens the preview route in a new tab). Google-native files show a `Badge` "PDF". `pending`: "Los archivos estarán disponibles pronto." `export_too_large`: inline `Alert` "Este documento es muy grande; pide el PDF a tu equipo." **Ver** only for PDF, JPEG, PNG, WebP and GIF.
- **Enviar archivos:** drop zone + file button (`accept` from the allowlist), per-file progress via `XMLHttpRequest` upload events, one request per file, errors per file (413 "El archivo supera 50 MB", 415 "Tipo de archivo no permitido", 409 "Aún no puedes enviar archivos a este proyecto"). Below it, **Mis envíos**: my uploads (name, size, date).
- Unknown or revoked project → Next `notFound()` (404 page in Spanish, link to `/portal`).

### 3.4 Portal 404 and errors
- `app/portal/not-found.tsx` and `app/portal/error.tsx` in Spanish, inside the portal shell.

---

## 4. Module layout

```
app/login/page.tsx                         (changed)
app/login/denegado/page.tsx                (new)
app/proyectos/[id]/archivos/page.tsx       (new) + components/proyectos/ProjectFilesBrowser.tsx
app/proyectos/[id]/clientes/page.tsx       (new) + components/proyectos/PortalAccessPanel.tsx, InvitePortalClientSheet.tsx
app/configuracion/google/page.tsx          (new) + components/configuracion/GoogleWorkspaceSettings.tsx
app/portal/layout.tsx · login/page.tsx · page.tsx · proyectos/[id]/page.tsx · not-found.tsx · error.tsx
components/portal/ (PortalShell, PortalProjectCard, PortalSchedule, PortalFileBrowser, PortalUploader, OtpForm)
lib/types/portal.ts · lib/types/workspace-access.ts
```
Portal components never import from `components/` subfolders that read staff data; shared shadcn primitives in `components/ui` are fine.

---

## 5. Types consumed by the UI

From `lib/types/portal.ts` (defined in backend §B.4.3): `PortalProjectDTO`, `PortalScheduleDTO`, `PortalFileDTO`, `PortalFolderDTO`, `PortalUploadDTO`.

```ts
// lib/types/portal.ts (staff side)
type PortalAccessRow = {
  accessId: string; portalUserId: string; name: string; email: string;
  contact: { id: string; name: string; type: "cliente" | "socio" };
  status: "invited" | "active" | "disabled" | "revoked";
  invitedBy: string; lastLoginAt: string | null;
};
type PortalActionError = "forbidden" | "not_found" | "staff_domain" | "disabled" | "already_active"
  | "not_project_contact" | "socio_unconfirmed" | "invalid_email" | "rate_limited";
type PortalActivityRow = { id: string; clientName: string; fileName: string; action: "download" | "preview" | "upload"; at: string };

// lib/types/workspace-access.ts
type GroupMapping = { id: string; groupEmail: string; kind: "role" | "area"; role: string | null; areaId: string | null; areaName: string | null; rank: number };
type GoogleHealth = { serviceAccountEmail: string | null; sharedDriveId: string | null; tokenKeyConfigured: boolean;
  lastDirectoryError: { at: string; message: string } | null; lastDriveError: { at: string; message: string } | null;
  googleLinkedStaff: number; activeStaff: number };
type StaffFilesResult =
  | { status: "pending" | "failed"; error?: string }
  | { status: "needs_consent" }
  | { status: "no_drive_access" }
  | { status: "ok"; folderId: string; breadcrumbs: { id: string; name: string }[];
      items: { id: string; name: string; mimeType: string; sizeBytes: number | null; modifiedAt: string; iconLink: string | null; webViewLink: string | null; kind: "file" | "folder" }[] };
```

---

## 6. Components (shadcn mapping)

| Need | Component |
|---|---|
| OTP entry | `InputOTP` (add via shadcn CLI if missing) |
| Drawers for invite and group mapping | `Sheet` |
| Confirm revoke / disable / delete mapping | `AlertDialog` |
| Tables | existing `DataTable` |
| Status | `Badge` (variants only; no custom colors) |
| Portal tabs | `Tabs` |
| Progress | `Progress` |
| Inline feedback | `Alert` |
| Breadcrumbs | `Breadcrumb` |
| Contact picker | Combobox pattern: `Popover` + `Command` |

Missing from `components/ui/shadcn` today and added with the shadcn CLI (no custom components): `alert`, `breadcrumb`, `command`, `input-otp`.

---

## 7. API contract (what the UI calls)

### 7.1 Staff (session cookie)

| Call | Kind | Request | Response / errors |
|---|---|---|---|
| `/api/auth/google/start?scope=&return_to=` | GET route | `scope` ∈ `drive`, `calendar` (optional); `return_to` validated by `safeReturnTo` | 302 to Google |
| `/api/auth/signout?next=` | GET route | | clears the staff cookie and session, 302 to `next` (validated) |
| `/api/auth/google/callback` | GET route | Google `code`, `state` | 302 `/dashboard`, `return_to`, `/login?error=…` or `/login/denegado?motivo=…` |
| `GET /api/proyectos/[id]/archivos?folder=` | route | | 200 `StaffFilesResult`; 401 no session; 404 unknown project or folder outside it |
| `retryProjectFolderAction(projectId)` | server action | | `{ ok: true, status }` / `{ ok: false, error }` |
| `listProjectPortalAccessAction(projectId)` | server action | | `PortalAccessRow[]` |
| `invitePortalClientAction({ projectId, contactId, email, name, confirmSocio? })` | server action | | `{ ok: true, emailSent }` / `{ ok: false, error: PortalActionError }` (backend §B.4.1) |
| `resendPortalInviteAction(portalUserId, projectId)` | server action | | `{ ok: true, emailSent }` / `{ ok: false, error: "forbidden" \| "not_found" \| "rate_limited" }` |
| `revokePortalAccessAction(accessId)` | server action | | `{ ok: true }` / `{ ok: false, error: "forbidden" \| "not_found" }` |
| `disablePortalUserAction(portalUserId)` / `enablePortalUserAction(portalUserId)` | server action | | `{ ok: true }` / `{ ok: false, error: "forbidden" \| "not_found" }` |
| `listProjectPortalActivityAction(projectId)` | server action | | `PortalActivityRow[]` |
| `listGroupMappingsAction()` / `create…` / `update…` / `deleteGroupMappingAction` | server actions | `GroupMapping` fields | `GroupMapping[]` / `{ ok: true, mapping }` / `{ ok: false, error: "group_not_found" \| "duplicate" \| "invalid" \| "directory_error" \| "forbidden" }` |
| `recheckStaffAccessAction(staffId)` | server action | | `{ ok: true, allowed, reason? }` / `{ ok: false, error: "directory_error" \| "not_google_linked" \| "forbidden" }` |
| `ensureMissingProjectFoldersAction()` | server action | | `{ created, failed, skipped }` |
| `getGoogleHealthAction()` | server action | | `GoogleHealth` |

Existing Drive picker routes (`/api/google/drive/*`) keep their request/response shapes. With `mode = "staff_token"` they answer **403 `{ error: "needs_consent" }`** without a Drive grant; 401 still means "no session". `GET /api/google/drive/status` → `{ configured: boolean, mode: "delegation" | "staff_token", hasDriveGrant: boolean, googleLinked: boolean }`.

### 7.2 Portal (portal cookie)

| Call | Request | Response / errors |
|---|---|---|
| `POST /api/portal/auth/code` | `{ email }` | 200 `{ message }` always; 429 |
| `POST /api/portal/auth/verify` | `{ email, code }` | 200 `{ redirect }` + cookie; 400 `invalid_code`; 429 |
| `POST /api/portal/auth/logout` | | 204 |
| `GET /api/portal/auth/logout?next=` | | clears the cookie, 302 to `next` (validated) |
| `GET /api/portal/projects/[pid]/files?folder=` | | `PortalFolderDTO` or `{ pending: true }`; 404 |
| `GET /api/portal/projects/[pid]/files/[fileId]/download` | | file stream; 404; 422 `export_too_large` |
| `GET /api/portal/projects/[pid]/files/[fileId]/preview` | | inline stream; 404; 415; 422 |
| `POST /api/portal/projects/[pid]/uploads` | multipart `file` | 201 `PortalUploadDTO`; 404; 409; 413; 415 |
| `GET /api/portal/projects/[pid]/uploads` | | `PortalUploadDTO[]`; 404 |

Portal pages read projects, summary and cronograma in server components through `lib/portal/queries.ts` (`listPortalProjects(user)`, `getPortalProject(user, pid)`, `getPortalSchedule(user, pid)`); they don't need extra HTTP routes.

Every portal call answers 401 `{ redirect: "/portal/login" }` without a valid portal session; client code redirects on it.

---

## 8. Data flow and client state

- Server components load initial data (staff: session helpers; portal: `requirePortalUser` + portal queries). Client components handle only interaction (folder navigation via `router.push` with `?folder=`, uploads, dialogs).
- Mutations are server actions followed by `router.refresh()`; no client cache library is introduced.
- Portal file lists fetch from the route on folder change with `fetch` and `AbortController`.

## 9. Responsiveness and a11y

- Portal designed at 360 px first; touch targets ≥ 44 px; tables become stacked lists below `sm`.
- OTP input announces errors via `aria-live`; upload progress uses `role="progressbar"` with values.
- All icons that act as buttons have Spanish `aria-label`s.

## 10. Testing (frontend)

- Vitest + Testing Library: `AppRouteGuard` renders `/login/denegado` and `/portal/*` without a staff session; OTP form steps and errors; uploader allowlist, size check and progress states; Archivos states (`pending`, `failed`, `needs_consent`, `no_drive_access`, `ok`); invite sheet `socio` confirmation; read-only role/area fields for Google-managed staff.
- Playwright (local, not CI): portal login with a code read from Mailpit, invite → login → see one project → download → upload, revoke → 404; login page with each flag combination.

## 11. Acceptance criteria (frontend-relevant)

1. `/login` shows only the methods enabled by the flags.
2. Each `motivo` on `/login/denegado` shows its message.
3. Archivos shows the right state for pending, failed, no consent, no Drive access and ready folders.
4. The Clientes page hides actions the user lacks permissions for, and the server refuses them anyway.
5. The portal is usable at 360 px: login, project list, tabs, download and upload.
6. Portal responses rendered in the UI contain no task names, assignees or Drive links.
7. Role and area fields of Google-managed staff are read-only in Equipo.

## 12. Open questions

1. Should the portal reuse the cronograma's Gantt bars, or is the section list enough for v1? This spec assumes the list.
