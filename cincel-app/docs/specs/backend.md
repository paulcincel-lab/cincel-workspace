# Spec: Staff Google Sign-in + Client Portal (Backend)

**Status:** Ready for review · **Owner:** Oscar · **Date:** 2026-10-28
**Companion:** `docs/specs/frontend.md` (same features, UI side)
**Source drafts:** `docs/specs/source/staff-sso-spec.md`, `docs/specs/source/client-portal-spec.md`. This spec adapts them to the existing `cincel-app` codebase. Where the two disagree, this spec wins.

Two features, built in order:
- **Part A: Staff sign-in with Google Workspace.** Workspace groups decide who gets in, their role and their areas. Access is re-checked every 4 hours. Projects get a Drive folder automatically. Staff see Drive with their own Google permissions.
- **Part B: Client portal.** Invited clients sign in with an emailed code and see a read-only view of their projects and the files in each project's `02 Cliente` folder. They can send files to the team.

---

## 0. Context and settled decisions

### 0.1 The existing app (build on it, don't replace it)

| Concern | What exists today | Where |
|---|---|---|
| Staff sessions | Opaque DB sessions: random cookie token, sha256 stored in `core.sessions` | `lib/auth/session.ts`, `lib/auth/session-cookie.ts`, `lib/db/schema/auth.ts` |
| Staff login | Email + scrypt password in `core.auth_credentials`, first-access + change-password flow | `lib/auth/auth-actions.ts`, `lib/auth/password.ts`, `app/login`, `app/change-password` |
| Roles | 9 roles in `OFFICIAL_CINCEL_ROLES` (Administrador, Dirección, Jefe de Taller, Jefe de Construcción, Arquitecto Senior, Arquitecto Junior, Colaborador, Pasante / Servicio Social, Otros), stored as text in `core.staff.role` | `lib/data/roles.ts` |
| Permissions | Per-module capabilities per role, editable in Configuración → Permisos | `lib/auth/permissions.ts`, `lib/auth/permissionsRegistry.ts`, `app/configuracion/permisos` |
| Staff, areas | `core.staff` (email unique lower, partial on not deleted), `core.areas`, `core.area_members` (staff ↔ area) | `lib/db/schema/people.ts` |
| Projects | `core.projects` (client = contact of type `cliente`), `project_contacts`, `project_links` (`kind` `interno`/`cliente`) | `lib/db/schema/projects.ts` |
| Contacts | `core.contacts`, type enum `cliente` / `socio` / `proveedor` | `lib/db/schema/contacts.ts`, `_schema.ts` |
| Cronograma | `core.project_schedules`, `core.schedule_tasks` (`planta`, `seccion`, `tarea`, `inicio`, `fin`, `status`, `responsable`) | `lib/db/schema/schedule.ts` |
| Google Drive (today) | Service account **with domain-wide delegation** impersonating the user (`drive.readonly`), picker routes under `app/api/google/drive/*`, files cached in `core.drive_files` | `lib/google/client.ts` |
| Google OAuth (today) | Separate "connect your Google account" flow (any account) for Drive picker switching and Calendar sync; plaintext tokens in `core.google_oauth_accounts` | `lib/google/oauth.ts`, `app/api/google/oauth/*` |
| Middleware | Redirects requests without the staff session cookie to `/login`, and `/login` with a cookie to `/dashboard`; skips `/api`, `/_next`, files. Next 16 calls this file `proxy.ts`; renaming it is out of scope | `middleware.ts` |
| Client route guard | `AppRouteGuard` in the root layout: only `/login` and `/change-password` are public; everything else needs an active staff session; `/configuracion/*` needs Administrador; `pending_first_access` is forced to `/change-password` | `components/auth/AppRouteGuard.tsx`, `app/layout.tsx` |
| Reverse proxy (self-hosted example) | `client_max_body_size 20m`, `proxy_read_timeout 60s` | `deploy/nginx/cincel-app.conf` |
| Schema conventions | `core.table()` / `core.enum()` from `_schema.ts`, `...stamps` on mutable tables, `...soft` where rows are soft-deleted, uuid PKs, Drizzle migrations in `lib/db/migrations` | `lib/db/schema/_schema.ts` |
| Server code | Server Actions per entity in `lib/actions/*-actions.ts`, thin `lib/repositories/*` delegates, route handlers under `app/api` | |
| Deploy | Docker image on Keter Console (`kcd.yml`), Postgres 17 | `cincel-app/kcd.yml` |

### 0.2 Decisions already made (don't revisit)

1. **No new auth library.** Staff Google sign-in creates a normal `core.sessions` row through the existing `createSession()`. The access gate runs in our own OAuth callback **before** `createSession()`, so no session exists for a refused user.
2. **Workspace groups are the source of truth** for who can sign in, their role (one of the existing roles) and their areas (`core.area_members`). Cincel mirrors the groups; it doesn't edit role or areas by hand for staff who sign in with Google.
3. **The 9 existing roles and the Permisos screen stay.** What each role can do keeps coming from `permissionsRegistry`. Groups only decide *which* role a person has.
4. **Every staff member sees every project.** There is no area-based visibility filter. Editing is decided by the existing role permissions. An area that has no work on a project yet just shows empty for that project.
5. **Passwords are retired after cutover.** During cutover both login methods work (feature flags, §A.8). After cutover, password login is off and `auth_credentials` rows are disabled, not deleted.
6. **Drive: no domain-wide delegation.** Staff Drive calls use the staff member's own Google token (incremental consent). The service account acts as itself: Directory API reads, project folder creation, and serving client files. The existing delegation code is removed, and issue #134 is closed as no longer needed.
7. **One company Shared Drive.** Every project gets one folder in it (`<code> · <name>`) with three subfolders: `01 Interno`, `02 Cliente`, `03 Del cliente`. The service account is a Content manager on the Shared Drive. Staff get access through a Workspace group that is a member of the Shared Drive.
8. **The staff Google account replaces "connect any Google account".** The picker and Calendar sync use the same Workspace account the person signed in with. Switching to personal Google accounts goes away.
9. **Clients have their own login, fully separate from staff:** their own tables, cookie and routes. A client session never satisfies a staff check, and a staff session never satisfies a portal check.
10. **Clients sign in with a 6-digit emailed code.** No passwords. Access is by explicit invitation per project.
11. **Cincel is the gate for client files, not Drive.** The service account lists and streams files from `02 Cliente`. Clients never get Drive permissions or Drive links. *A file is visible to a project's invited clients if and only if it's inside that project's `02 Cliente` folder.*
12. **Google Docs/Sheets/Slides/Drawings reach clients as PDF.**
13. **Portal UI copy is Spanish (Mexico).**

### 0.3 Defaults to confirm with the client (build with these unless told otherwise)

| Topic | Default |
|---|---|
| Group → role mapping | `cincel-administradores` → Administrador (rank 80), `cincel-direccion` → Dirección (70), `cincel-jefes-taller` → Jefe de Taller (60), `cincel-jefes-construccion` → Jefe de Construcción (50), `cincel-arquitectos-senior` → Arquitecto Senior (40), `cincel-arquitectos-junior` → Arquitecto Junior (30), `cincel-colaboradores` → Colaborador (20), `cincel-pasantes` → Pasante / Servicio Social (10). Highest rank wins. `Otros` gets no group by default. |
| Area groups | `cincel-area-<slug>@<domain>` per row in `core.areas` |
| Access re-check interval | 4 hours |
| Staff session length | Keep the current session lifetime |
| Shared Drive members | Group `cincel-todos@<domain>` (contains the role groups) as Content manager; service account as Content manager |
| Who can invite / revoke portal clients | New permission `portal.manageAccess`. Default on for Administrador, Dirección, Jefe de Taller, Jefe de Construcción |
| Who can disable or re-enable a portal user | New permission `portal.disableUsers`. Default on for Administrador only |
| Who can be invited | Contacts of type `cliente` or `socio` (`socio` shows a warning) |
| What the cronograma shows clients | Per `seccion` (partida): name, `planta`, first `inicio`, last `fin`, % done (`done` tasks ÷ all tasks). No `tarea` names, no `responsable`, no flags, no payment, imprevistos or adicionales rows. The schedule has no milestone concept, so none are shown. |
| Client upload limits | 50 MB per file; PDF, JPG/PNG/HEIC, Office (doc/docx/xls/xlsx/ppt/pptx), DWG/DXF, ZIP |
| Client session length | 30 days, sliding (refreshed at most once a day) |
| Notify staff on client upload | Email to the project's `manager_id` and `coordinator_id` |
| Email transport | SMTP via `nodemailer` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`). Mailpit in local `docker-compose.yml`. |

---

# Part A: Staff sign-in with Google Workspace

## A.1 Goals and non-goals

**Goals**
- A staff member clicks **Entrar con Google**, picks their company account and lands in Cincel with the right role and areas. Nobody sets up an account in Cincel.
- Anyone in no Cincel role group, outside the domain, or suspended in Workspace is refused with a clear message, and no session is created.
- Removing someone from the groups, or suspending them in Workspace, removes their access within 4 hours with no action in Cincel. **Revisar acceso ahora** does it at once.
- Every project gets a Drive folder automatically. Staff see its files inside Cincel, filtered by what Drive lets them see.

**Non-goals (v1)**
- Editing or uploading files from the staff UI. Staff work in Drive directly.
- Push notifications of group changes. Polling at re-check is enough.
- Area-based project visibility (decision 4).

## A.2 Google credentials

| Credential | Used for | Scopes |
|---|---|---|
| **Staff OAuth client** "Cincel Staff" (Internal), one per environment | Sign-in; the staff member's own Drive and Calendar calls | Sign-in: `openid email profile`. Drive feature: + `https://www.googleapis.com/auth/drive.readonly`. Calendar sync: + `https://www.googleapis.com/auth/calendar.app.created`. Both added incrementally. |
| **Service account** `cincel-directory` (server only, no `subject`) | Group membership and user status (Directory API); project folders; client file list/stream/upload | `https://www.googleapis.com/auth/admin.directory.group.member.readonly`, `https://www.googleapis.com/auth/admin.directory.user.readonly`, `https://www.googleapis.com/auth/drive` |

The service account calls the Directory API **as itself**, through a custom admin role ("Cincel directory reader": read Users and Groups) assigned to it in the Admin console. It calls Drive as itself, as a member of the Shared Drive. **No domain-wide delegation anywhere.**

The existing `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` env vars are reused for the staff OAuth client; the client itself becomes an Internal client of the company's Cloud project (§A.9).

## A.3 Data model

All tables use `core.table()`; migration generated with `drizzle-kit generate` into `lib/db/migrations`.

```ts
// lib/db/schema/people.ts — additions to core.staff
googleSub: text("google_sub"),                                   // stable Google id
accessCheckedAt: timestamp("access_checked_at", { withTimezone: true }),
accessRevokedAt: timestamp("access_revoked_at", { withTimezone: true }),
accessRevokedReason: text("access_revoked_reason"),             // "no_role_group" | "workspace_suspended" | "workspace_deleted"
lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
// table extras:
uniqueIndex("staff_google_sub_uq").on(t.googleSub).where(sql`${t.googleSub} is not null and ${t.deletedAt} is null`),
```

```ts
// lib/db/schema/people.ts — new
export const groupMappingKind = core.enum("group_mapping_kind", ["role", "area"]);

/** Admin-configured: which Workspace group means which role or area. */
export const workspaceGroupMappings = core.table("workspace_group_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupEmail: text("group_email").notNull(),              // shown in UI
  groupId: text("group_id").notNull(),                    // from groups.get; survives renames
  kind: groupMappingKind("kind").notNull(),
  role: text("role"),                                     // kind = role: one of OFFICIAL_CINCEL_ROLES
  areaId: uuid("area_id").references(() => areas.id, { onDelete: "cascade" }), // kind = area
  rank: integer("rank").notNull().default(0),             // kind = role: higher wins
  ...stamps,
}, (t) => [
  uniqueIndex("workspace_group_mappings_group_uq").on(t.groupId, t.kind),
  check("workspace_group_mappings_kind_check", sql`(${t.kind} = 'role' and ${t.role} is not null and ${t.areaId} is null) or (${t.kind} = 'area' and ${t.areaId} is not null and ${t.role} is null)`),
]);

// core.area_members — addition
source: text("source").notNull().default("manual"),      // "manual" | "workspace"
```

```ts
// lib/db/schema/projects.ts — additions to core.projects
export const driveFolderStatus = core.enum("drive_folder_status", ["pending", "ready", "failed"]);
driveFolderId: text("drive_folder_id"),
driveInternalFolderId: text("drive_internal_folder_id"),   // "01 Interno"
driveClientFolderId: text("drive_client_folder_id"),       // "02 Cliente"
driveInboundFolderId: text("drive_inbound_folder_id"),     // "03 Del cliente"
driveFolderStatus: driveFolderStatus("drive_folder_status").notNull().default("pending"),
driveFolderError: text("drive_folder_error"),
```

```ts
// lib/db/schema/auth.ts — core.google_oauth_accounts changes
// accessToken / refreshToken become ciphertext (AES-256-GCM, key TOKEN_ENCRYPTION_KEY, format "v1:<iv>:<tag>:<data>" base64).
// Add:
googleSub: text("google_sub"),        // must equal core.staff.google_sub
```

```ts
// lib/db/schema/auth.ts — new: sign-in audit
export const authEvents = core.table("auth_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),          // "staff_login_allowed" | "staff_login_denied" | "staff_recheck_kept" | "staff_recheck_revoked" | "staff_recheck_error" | "password_login"
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  email: text("email"),
  reason: text("reason"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_auth_events_at").on(t.at), index("idx_auth_events_staff_id").on(t.staffId)]);
```

**Migration of existing data**
- Existing `google_oauth_accounts` rows are **not** deleted by the Part A migration: the old connect flow keeps using them while `AUTH_GOOGLE_ENABLED=false` (§A.8). New rows are written encrypted with `google_sub` set. Rows with `google_sub` null are legacy: ignored once the flag is on, replaced when that staff member grants Drive or Calendar, and deleted by the cleanup migration in §A.8 step 5. `google_calendar_syncs` rows are kept and reattach when the same staff member grants the Calendar scope again.
- Existing `area_members` rows stay `source = 'manual'`. A Workspace check replaces a staff member's area rows only once at least one `area` mapping exists (§A.4), so the first sign-ins before mappings are configured don't wipe manual areas.
- Seed (`scripts/seed.ts`) inserts no group mappings: group IDs differ per Workspace. Admins add them in Configuración → Grupos de Google (§A.7), which resolves each group ID.

## A.4 Sign-in flow

```mermaid
sequenceDiagram
  autonumber
  actor U as Staff member
  participant B as Browser
  participant N as Next.js
  participant G as Google OAuth
  participant D as Directory API (service account)
  participant DB as Postgres
  U->>B: /login → "Entrar con Google"
  B->>N: GET /api/auth/google/start
  N-->>B: redirect to Google (openid email profile, hd=domain, prompt=select_account, state + PKCE in httpOnly cookie)
  G-->>N: GET /api/auth/google/callback?code&state
  N->>G: exchange code → ID token (sub, email, email_verified, hd)
  N->>N: verify ID token signature, aud, state; reject unless hd == GOOGLE_WORKSPACE_DOMAIN and email_verified
  N->>D: users.get(sub) → suspended / archived?
  N->>D: members.hasMember(groupId, email) for each mapped group
  alt no role group, suspended, domain, sub_mismatch, needs_link, inactive
    N->>DB: auth_events (staff_login_denied, reason)
    N-->>B: redirect /login/denegado?motivo=…   (no session)
  else Directory error
    N-->>B: redirect /login?error=retry   (no session)
  else granted
    N->>DB: upsert staff by google_sub (first time: link by lower(email) where google_sub is null; else create)
    N->>DB: role = highest-rank role group · replace area_members where source='workspace' · clear access_revoked_*
    N->>DB: access_checked_at = now, last_login_at = now, auth_events (staff_login_allowed)
    N->>DB: createSession(staffId)
    N-->>B: session cookie → /dashboard
  end
```

Rules:
- **Gate before the session.** All checks run in `app/api/auth/google/callback/route.ts` before `createSession()`.
- **ID token verification** with `google-auth-library` `OAuth2Client.verifyIdToken` (audience = client ID). Check `hd` server-side; the `hd` URL parameter alone isn't enough.
- **Match on `sub`, not email.** Resolve the staff row in this order, ignoring soft-deleted rows:
  1. `google_sub = sub` → that row.
  2. `lower(email) = lower(token email)` and `google_sub` is null → link it (set `google_sub`).
  3. `lower(email)` matches but `google_sub` differs → refuse (`reason: sub_mismatch`), log.
  4. No email match, and `lower(name)` collides with an existing staff row (`staff_name_lower_uq`) → **don't create**; refuse with `reason: needs_link` ("Tu usuario de Cincel no tiene este correo. Pide a un administrador que registre {email} en tu ficha de Equipo.") and log. An admin fixes it by setting the email on the existing row in Equipo, then the person signs in again (rule 2).
  5. Otherwise create `core.staff` with `name` from the ID token, `email` lowercase, `kind = 'empleado'`, `active = true`.
  The upsert runs in one transaction; a unique violation still maps to `needs_link`, never a 500.
- **No password state for Google staff.** On every successful Google sign-in, if an `auth_credentials` row exists, set `must_change_password = false`. `getSessionAccess()` never returns `pending_first_access` for staff with `google_sub` set.
- **Areas are replaced, not merged,** but only when at least one `area` mapping exists whose area isn't soft-deleted: delete the person's `area_members` rows (both sources), then insert one `workspace` row per matched area group. With no area mappings configured, areas are left as they are. Mappings pointing at soft-deleted areas are ignored. `area_members.role` is not set by the sync.
- **A role group but no area group** may sign in; they see projects (decision 4) and an empty "Mis áreas".
- **Directory failure** (5xx, timeout, network): no session; redirect to `/login?error=retry` ("No pudimos verificar tu acceso con Google. Intenta de nuevo."). Log it.
- `staff.active = false` (deactivated in Equipo) still refuses sign-in (`reason: inactive`), independent of groups.
- **Denial reasons** (the `motivo` values, shared with the frontend): `no_role_group`, `workspace_suspended`, `workspace_deleted`, `domain`, `inactive`, `sub_mismatch`, `needs_link`, `revoked` (re-check, §A.5). OAuth `state` errors go to `/login?error=state`.
- **Directory calls run in parallel** (`users.get` and every `hasMember` together), each with a 5 s timeout.
- Sign-in also stores the Google tokens (encrypted) in `google_oauth_accounts` with the granted scope, so later incremental grants extend the same row.

Module layout:
```
lib/google/service-account.ts   // JWT for the service account (no subject); scopes per client
lib/google/directory.ts         // getUserStatus(sub), hasMember(groupId, email), getGroup(email)
lib/google/staff-oauth.ts       // auth URL (state, PKCE, hd, incremental scopes), code exchange, verifyIdToken, token refresh
lib/google/token-crypto.ts      // encrypt/decrypt with TOKEN_ENCRYPTION_KEY
lib/auth/workspace-access.ts    // evaluateAccess(sub, email) → { allowed, role, areaIds, reason }; applyAccess(staffId, result)
app/api/auth/google/start/route.ts
app/api/auth/google/callback/route.ts
```

## A.5 Periodic access re-check

Extend the existing session helpers (`getSessionAccess`, `requireSession`, `requireSessionAccess`, `requireCapabilityUser` in `lib/auth/session.ts`). They stay the only way server code gets the current staff member.

```mermaid
sequenceDiagram
  autonumber
  participant P as Page / action / route
  participant R as session helper
  participant D as Directory API
  participant DB as Postgres
  P->>R: any protected request
  R->>DB: session → staff
  alt staff.access_revoked_at set or staff.active = false
    R->>DB: delete the staff member's sessions
    R-->>P: redirect /api/auth/signout?next=/login/denegado?motivo=revoked
  else google_sub set and access_checked_at older than ACCESS_RECHECK_HOURS
    R->>DB: claim the check (conditional update of access_checked_at)
    R->>D: users.get + hasMember for mapped groups
    alt still allowed
      R->>DB: update role, area_members, access_checked_at
    else not allowed
      R->>DB: access_revoked_at/reason, delete all sessions, auth_events
      R-->>P: redirect /api/auth/signout?next=/login/denegado?motivo=revoked
    else Directory error
      R->>DB: auth_events (staff_recheck_error); keep current access
    end
  end
  R-->>P: session user (role, areas)
```

- **One check at a time, without holding a lock over HTTP:** a request claims the check with `update core.staff set access_checked_at = now() where id = $1 and (access_checked_at is null or access_checked_at < now() - interval '<ACCESS_RECHECK_HOURS> hours') returning id`. Only the request that gets a row back calls the Directory API; the others proceed with current access.
- A Directory error at re-check never signs anyone out. The claim already advanced `access_checked_at`, so on error it is set back to `now() - ACCESS_RECHECK_HOURS + 5 minutes`: the next check runs 5 minutes later, and the backoff survives restarts.
- Staff without `google_sub` (still on passwords during cutover) are not re-checked.
- A revoked person who is re-added to a group gets back in at their next Google sign-in (A.4 clears `access_revoked_*`).
- `middleware.ts` stays a cookie-presence check only (no DB or Google calls).

### A.5.1 Route guard, stale cookies and sign-out

Server Components can't delete cookies, so a revoked or expired session leaves its cookie behind. Rules that avoid redirect loops:
- **Sign-out route:** `GET /api/auth/signout?next=<path>` deletes the staff session row (if any) and the cookie, then redirects to `safeReturnTo(next)` (§A.10). Every server-side "this session is no longer valid" outcome redirects through it: revoked at re-check → `/api/auth/signout?next=/login/denegado?motivo=revoked`; session row missing or expired → `/api/auth/signout?next=/login`.
- **`middleware.ts`:** drop the `/login → /dashboard` redirect for requests with a cookie. The `/login` page (server component) calls `getSessionAccess()` and redirects to `/dashboard` itself only when the session is `active`.
- **`AppRouteGuard`:** public routes become `/login`, `/login/denegado`, `/change-password`, and every path under `/portal`. For `/portal` paths the guard renders children without any staff check (the portal layout does its own checks, §B.4.3). When the server resolution is `guest` but a staff cookie may exist, the guard sends the browser to `/api/auth/signout?next=/login` instead of `/login`.
- **`/change-password`:** only reachable for `pending_first_access` while `AUTH_PASSWORD_ENABLED=true`; otherwise it redirects to `/dashboard` (active) or `/login` (guest), never back and forth.
- Tests cover each public path, the revoked-cookie path and the `must_change_password` path (§10).

## A.6 Drive

### A.6.1 Project folder creation

```mermaid
sequenceDiagram
  autonumber
  participant A as createProject action
  participant DB as Postgres
  participant S as Drive API (service account)
  A->>DB: insert project (drive_folder_status = pending), commit
  A->>S: files.create folder "<code> · <name>" in GOOGLE_SHARED_DRIVE_ID (supportsAllDrives)
  A->>S: files.create 01 Interno · 02 Cliente · 03 Del cliente inside it
  A->>DB: folder ids, drive_folder_status = ready
  Note over A,S: failure → status failed + drive_folder_error; project still usable; "Reintentar carpeta"
```

- Runs after the project row commits, via `after()` from `next/server` so the action returns at once. A Drive failure never rolls back the project.
- `ensureProjectFolders(projectId)` is idempotent: if `drive_folder_id` is set, it only creates missing subfolders (found by name under the parent first).
- Renaming a project or changing its code renames the folder (best effort; failure is logged in `drive_folder_error`, status stays `ready`).
- Archiving or soft-deleting a project doesn't touch Drive.
- Folder name: `<code> · <name>`, or `<name>` when the project has no code; `/` and control characters replaced by spaces, max 200 chars.
- `retryProjectFolderAction(projectId)` in `lib/actions/projects-actions.ts`: staff session + projects capability `canEditProjectGeneral`; runs `ensureProjectFolders(projectId)` synchronously; returns `{ ok: true, status: "ready" | "failed", error?: string }` or `{ ok: false, error: "forbidden" | "not_found" }`.
- Existing projects: an admin action **Crear carpetas faltantes** (Configuración → Google) runs `ensureProjectFolders` for every project with status `pending` or `failed`, sequentially, and reports counts.
- Module: `lib/google/drive-admin.ts` (service-account Drive client: create folder, rename, get parents, list, get media, export, resumable upload).

### A.6.2 Incremental consent (staff)

- The first time a staff member opens a Drive feature (project Archivos tab, Recursos picker) and their `google_oauth_accounts.scope` lacks `drive.readonly`, the UI shows **Conectar Google Drive**. It goes to `/api/auth/google/start?scope=drive&return_to=…` with `include_granted_scopes=true`, `access_type=offline`, `prompt=consent`, `login_hint=<email>`.
- Calendar sync does the same with `scope=calendar` (`calendar.app.created`).
- The callback for an already signed-in staff member updates tokens and scope. If the staff member has a `google_sub`, the token's `sub` must equal it (else refuse with `sub_mismatch`). If they have none yet (still on a password session during cutover), the callback runs the full §A.4 resolution and gate for that token: on success it links `google_sub` to **the signed-in staff row** (only if the email matches it; otherwise `sub_mismatch`), applies role and areas, and stores the tokens. So password users can grant Drive during cutover, and doing so is their Google link.
- `return_to` is validated with `safeReturnTo()` (§A.10).
- `drive.readonly` is a restricted scope, but the client is Internal, so Google doesn't review it. The admin checklist confirms the console shows no verification requirement.
- Refresh tokens are encrypted at rest and never sent to the browser.
- `invalid_grant` on refresh: clear the tokens and scope, and show **Conectar Google Drive** again.

### A.6.3 Staff Archivos tab and picker

- `GET /api/proyectos/[id]/archivos?folder=<id>` returns **200 with `StaffFilesResult`** (type in `lib/types/workspace-access.ts`, shared with the frontend):
  ```ts
  type StaffFilesResult =
    | { status: "pending" | "failed"; error?: string }          // projects.drive_folder_status; error = drive_folder_error
    | { status: "needs_consent" }                                // no token, or scope lacks drive.readonly, or invalid_grant
    | { status: "no_drive_access" }                              // Drive 403/404 for this user
    | { status: "ok"; folderId: string; breadcrumbs: { id: string; name: string }[];
        items: { id: string; name: string; mimeType: string; sizeBytes: number | null; modifiedAt: string;
                 iconLink: string | null; webViewLink: string | null; kind: "file" | "folder" }[] };
  ```
  1. Staff session (401 `{ error: "unauthorized" }` without one) + project exists and isn't deleted (else 404). All staff can view (decision 4).
  2. Folder status not `ready` → `{ status: "pending" | "failed" }`.
  3. No usable Drive grant → `{ status: "needs_consent" }`.
  4. `folder` defaults to `drive_folder_id`. It must be that folder or a descendant: walk the parent chain with the service account (`files.get` fields `id,name,parents,trashed`, max depth 10, cached 5 min). Otherwise 404. The walk also yields the breadcrumb names (root = project folder).
  5. `files.list` **with the staff member's token**: `q = '<folder>' in parents and trashed = false`, `supportsAllDrives`, `includeItemsFromAllDrives`, fields `id,name,mimeType,modifiedTime,size,iconLink,webViewLink`; mapped to `items` (`size` → `sizeBytes` number, `modifiedTime` → `modifiedAt`, folder mime → `kind: "folder"`).
  6. Drive 403/404 for the user → `{ status: "no_drive_access" }`.
- No download proxy for staff: each file links to `webViewLink`.
- **Existing picker routes** (`app/api/google/drive/list`, `file/[id]`, `file/[id]/content`, `status`) pick their Drive client by mode:
  - `AUTH_GOOGLE_ENABLED=false`: unchanged (delegation client, old connect flow). Drive and Calendar keep working exactly as today during rollout.
  - `AUTH_GOOGLE_ENABLED=true`: the staff member's own token. Without a usable Drive grant they answer **403 `{ error: "needs_consent" }`**. 401 keeps meaning "no session".
  - `GET /api/google/drive/status` returns `{ configured: boolean, mode: "delegation" | "staff_token", hasDriveGrant: boolean, googleLinked: boolean }`. The picker shows **Conectar Google Drive** when `mode = "staff_token"` and `hasDriveGrant` is false.
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` keeps its meaning (picker start folder) and defaults to the Shared Drive root. `GOOGLE_SA_CLIENT_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` stay as the service account credentials.
- `lib/google/client.ts` (delegation), `app/api/google/oauth/*` (connect any account) and legacy token rows are removed only in the cleanup step of §A.8 (step 5), after the flag is on in production.

## A.7 Admin surfaces (server side)

Server Actions in `lib/actions/workspace-access-actions.ts`, all requiring role **Administrador** (the same rule `AppRouteGuard` already applies to `/configuracion/*`; no new permission):
- `listGroupMappingsAction()` → `GroupMapping[]`; `createGroupMappingAction({ groupEmail, kind, role, areaId, rank })` and `updateGroupMappingAction(id, …)` (resolve the group with `groups.get`) → `{ ok: true, mapping: GroupMapping }` or `{ ok: false, error: "group_not_found" | "duplicate" | "invalid" | "directory_error" | "forbidden" }`; `deleteGroupMappingAction(id)` → `{ ok: true }`.
- `recheckStaffAccessAction(staffId)`: runs §A.5 for that person now, ignoring the interval → `{ ok: true, allowed: boolean, reason?: string }` or `{ ok: false, error: "directory_error" | "not_google_linked" | "forbidden" }`.
- `ensureMissingProjectFoldersAction()` (§A.6.1) → `{ created: number, failed: number, skipped: number }`.
- `getGoogleHealthAction()` → `GoogleHealth` (frontend §5): last Directory error, last Drive error (from `auth_events` / `drive_folder_error`), service account email, Shared Drive id, whether `TOKEN_ENCRYPTION_KEY` is set, Google-linked vs active staff counts.
- The staff list DTO (`staff-actions`) gains `googleManaged` (`google_sub` set), `lastLoginAt`, `accessRevokedAt`, `accessRevokedReason`.

Staff whose `google_sub` is set have role and areas managed by Workspace: `staff-actions` and `areas-actions` refuse to change their `role` or their `area_members` (error "Se administra en Google Workspace"). Other staff fields stay editable.

## A.8 Cutover (passwords → Google)

| Flag (env) | Default | Effect |
|---|---|---|
| `AUTH_GOOGLE_ENABLED` | `false` | Shows **Entrar con Google** and enables `/api/auth/google/*` |
| `AUTH_PASSWORD_ENABLED` | `true` | Shows the email/password form and enables `loginAction`, first access and change password |

1. Deploy with both on. Staff sign in with Google once; their rows get `google_sub`.
2. Configuración → Grupos de Google shows "N de M colaboradores activos ya entraron con Google".
   While both are on, password users can keep working; Drive and Calendar switch to staff tokens and a password user links Google by granting Drive (§A.6.2) or by signing in with Google.
3. Turn `AUTH_PASSWORD_ENABLED=false`: password routes return 404, `/change-password` redirects per §A.5.1, and `scripts/disable-passwords.ts` sets `auth_credentials.enabled = false` **and** `must_change_password = false` for staff with `google_sub`.
4. Break-glass: `AUTH_PASSWORD_ENABLED=true` again re-enables password login for rows still `enabled`.
5. Cleanup (its own release, after step 3 has run in production): delete `lib/google/client.ts`, `app/api/google/oauth/*`, the delegation branch of the picker routes, and legacy `google_oauth_accounts` rows with `google_sub` null (migration).

## A.9 Configuration

```
AUTH_GOOGLE_ENABLED=true
AUTH_PASSWORD_ENABLED=true
APP_ORIGIN=https://<app host>                # builds OAuth redirect URIs; not taken from the request
GOOGLE_OAUTH_CLIENT_ID=…                     # staff OAuth client (Internal)
GOOGLE_OAUTH_CLIENT_SECRET=…
GOOGLE_WORKSPACE_DOMAIN=cincel.mx
GOOGLE_WORKSPACE_CUSTOMER_ID=…               # optional, for groups.get
GOOGLE_SA_CLIENT_EMAIL=…                     # service account (existing var)
GOOGLE_SA_PRIVATE_KEY=…                      # existing var; never committed
GOOGLE_SHARED_DRIVE_ID=…
TOKEN_ENCRYPTION_KEY=<64 hex chars>          # AES-256 key (32 bytes as hex, = kcd generate: hex32). Ciphertext is prefixed "v1:" so a later key rotation can add "v2"; rotation itself is out of scope
ACCESS_RECHECK_HOURS=4
```

Update `.env.example`, `docker-compose.prod.yml`, `docs/google-drive.md` and the Keter recipe `kcd.yml` (added by PR #470; if it isn't merged yet, this task adds the variables once it is). Secrets: `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SA_PRIVATE_KEY`, `TOKEN_ENCRYPTION_KEY` (`generate: hex32`), `SMTP_PASSWORD`.

**Workspace admin checklist (client side, once):**
1. Cloud project "Cincel" in the client's organization; enable Admin SDK API and Google Drive API (and Calendar API for sync).
2. OAuth consent screen: user type **Internal**.
3. OAuth client (Web application). Redirect URI `<APP_ORIGIN>/api/auth/google/callback` for prod and staging.
4. Service account `cincel-directory` with a JSON key (sent securely).
5. Custom admin role "Cincel directory reader" (read Users, read Groups) assigned to the service account.
6. Groups: the 8 role groups, `cincel-area-<slug>` per area, `cincel-todos` containing the role groups.
7. Shared Drive "Cincel Proyectos": `cincel-todos` Content manager, service account Content manager.
8. Remove the old domain-wide delegation grant for the service account (#134 is closed, not done).
9. Send Cincel: domain, OAuth client id/secret, service account key, group emails, Shared Drive ID.

## A.10 Security requirements

- Verify the ID token, `hd` and `email_verified` on every Google sign-in; identify by `sub`.
- OAuth `state` and PKCE `code_verifier` in a short-lived (10 min) httpOnly cookie; callback refuses mismatches.
- **`safeReturnTo(value, fallback)`** in `lib/auth/safe-return-to.ts`, used for every `return_to` / `next` (staff and portal): the value must start with a single `/`, not `//` or `/\`, contain no control characters, and `new URL(value, APP_ORIGIN).origin` must equal `APP_ORIGIN`; otherwise `fallback` (`/dashboard`, or `/portal` for the portal). Redirect targets are always built from `APP_ORIGIN`, never from the request host.
- **Client IP** for rate limits and logs comes from `X-Real-IP`, which the reverse proxy sets; `X-Forwarded-For` is never trusted.
- No session before the gate passes.
- Service account key only in env secrets; read-only custom admin role.
- OAuth tokens encrypted at rest, never sent to the browser, never logged.
- Log sign-in allow/deny with reason, re-check outcomes and folder failures in `auth_events` / `drive_folder_error`.
- Staff cookie unchanged (`httpOnly`, `secure` in production, `sameSite=lax`).
- Rate limit `/api/auth/google/start`: 20 per 10 min per IP (in-process sliding window).

## A.11 Acceptance criteria

1. A domain user in `cincel-arquitectos-senior` + `cincel-area-construccion` signs in with Google and gets role Arquitecto Senior, area Construcción, and sees all projects.
2. A domain user in no role group is sent to `/login/denegado` ("Tu cuenta no tiene acceso a Cincel"); no `core.sessions` row is created; `auth_events` records it.
3. A personal Gmail account can't complete sign-in (Internal client and `hd` check).
4. In `cincel-direccion` and `cincel-colaboradores` → Dirección.
5. Removed from all role groups while signed in → the first request after 4 h signs them out and deletes their sessions. **Revisar acceso ahora** does it at once.
6. Suspended in Workspace → same as 5.
7. A Directory outage during re-check signs nobody out; during sign-in it shows the retry message.
8. Creating a project creates its folder and three subfolders in the Shared Drive. A Drive failure leaves the project usable with **Reintentar carpeta**.
9. The Archivos tab asks for Drive once, then lists folder contents with the user's own token. A user without Drive access sees "No tienes acceso a esta carpeta en Drive".
10. An existing staff row with a password and no `google_sub` is linked on first Google sign-in by email; afterwards changing the Google account's email doesn't break the link.
11. With `AUTH_PASSWORD_ENABLED=false`, `loginAction` refuses and the form is hidden.
13. A revoked staff member lands on `/login/denegado?motivo=revoked` with the cookie cleared; **Volver a intentar** shows `/login` without any redirect loop.
14. A staff member with `must_change_password = true` who signs in with Google goes straight to `/dashboard`.
15. With `AUTH_GOOGLE_ENABLED=false`, the Drive picker and Calendar sync work exactly as before the release.
16. A password-session staff member who clicks **Conectar Google Drive** during cutover gets linked (`google_sub` set) and their Drive works.
17. `return_to=//evil.example` and `return_to=https://evil.example` redirect to `/dashboard`.
12. Role and area edits for a Google-managed staff member are refused by the server actions, not just hidden.

---

# Part B: Client portal

Depends on Part A: service account Drive client, project folders (`drive_client_folder_id`, `drive_inbound_folder_id`, `drive_folder_status`).

## B.1 Goals and non-goals

**Goals**
- Staff invite a client to a project in two clicks; the client gets an email and is in within a minute.
- A client sees only the projects they're invited to, and only files in those projects' `02 Cliente`.
- Clients can send files to the team without email attachments.
- Revoking access takes effect on the client's next request.
- Every client download, preview and upload is logged.

**Non-goals (v1)**
- Client editing or commenting on Google Docs; messaging; client-visible tasks or approvals; per-client branding; Google sign-in for clients (phase 2, §B.9).

## B.2 Architecture

```
Browser (client) ──► Next.js
                      ├── /portal/*                       portal pages (Spanish)
                      ├── /api/portal/auth/*              send code, verify code, sign out
                      ├── /api/portal/projects/*          files list / download / preview / upload
                      ├── lib/portal/session.ts           requirePortalUser(), requireProjectAccess()
                      ├── lib/portal/queries.ts           portal DTO queries (never staff queries)
                      └── lib/google/drive-admin.ts       service account Drive (Part A)
Browser (staff)  ──► /proyectos/[id] → Clientes tab        invite / resend / revoke / disable (staff session)
Postgres: core.portal_users · portal_sessions · portal_login_codes · project_portal_access · portal_file_events · portal_audit_events
Email: lib/email (SMTP)
```

Portal cookie: `cincel_portal_session` (random 32-byte token, sha256 stored), `httpOnly`, `secure` in production, `sameSite=lax`, `path=/`. Staff helpers read only the staff cookie; portal helpers read only the portal cookie.

## B.3 Data model

```ts
// lib/db/schema/portal.ts
export const portalUserStatus = core.enum("portal_user_status", ["invited", "active", "disabled"]);

export const portalUsers = core.table("portal_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),                        // lowercase; the login identity
  name: text("name").notNull(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id),
  status: portalUserStatus("status").notNull().default("invited"),
  invitedByStaffId: uuid("invited_by_staff_id").notNull().references(() => staff.id),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  disabledByStaffId: uuid("disabled_by_staff_id").references(() => staff.id),
  ...stamps,
}, (t) => [uniqueIndex("portal_users_email_lower_uq").on(sql`lower(${t.email})`)]);

export const portalSessions = core.table("portal_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  portalUserId: uuid("portal_user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  userAgent: text("user_agent"),
  ip: text("ip"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_portal_sessions_user").on(t.portalUserId), index("idx_portal_sessions_expires_at").on(t.expiresAt)]);

export const portalLoginCodes = core.table("portal_login_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),                        // lowercase, as requested (known or not)
  portalUserId: uuid("portal_user_id").references(() => portalUsers.id, { onDelete: "cascade" }), // null when unknown
  codeHash: text("code_hash"),                           // sha256(code + id); null when unknown email
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ip: text("ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_portal_login_codes_email_created").on(t.email, t.createdAt), index("idx_portal_login_codes_ip_created").on(t.ip, t.createdAt)]);

export const projectPortalAccess = core.table("project_portal_access", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  portalUserId: uuid("portal_user_id").notNull().references(() => portalUsers.id, { onDelete: "cascade" }),
  grantedByStaffId: uuid("granted_by_staff_id").notNull().references(() => staff.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedByStaffId: uuid("revoked_by_staff_id").references(() => staff.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("project_portal_access_active_uq").on(t.projectId, t.portalUserId).where(sql`${t.revokedAt} is null`),
  index("idx_project_portal_access_user").on(t.portalUserId),
]);

export const portalFileAction = core.enum("portal_file_action", ["download", "preview", "upload"]);

export const portalFileEvents = core.table("portal_file_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  portalUserId: uuid("portal_user_id").notNull().references(() => portalUsers.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  driveFileId: text("drive_file_id").notNull(),
  fileName: text("file_name").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  action: portalFileAction("action").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_portal_file_events_project_at").on(t.projectId, t.at), index("idx_portal_file_events_user_at").on(t.portalUserId, t.at)]);

/** Staff-side portal actions: invite, resend, revoke, disable. */
export const portalAuditEvents = core.table("portal_audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: text("kind").notNull(),            // "invite" | "resend" | "revoke" | "disable"
  portalUserId: uuid("portal_user_id").notNull().references(() => portalUsers.id),
  projectId: uuid("project_id").references(() => projects.id),
  staffId: uuid("staff_id").notNull().references(() => staff.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("idx_portal_audit_events_user_at").on(t.portalUserId, t.at)]);
```

Expired `portal_sessions` and `portal_login_codes` older than 7 days are deleted opportunistically on each successful sign-in (bounded `delete … limit 500`).

## B.4 Flows

### B.4.1 Invite (staff)

All in `lib/actions/portal-actions.ts`. Errors are **codes**; the frontend maps them to Spanish copy.

```ts
type PortalActionError = "forbidden" | "not_found" | "staff_domain" | "disabled" | "already_active"
  | "not_project_contact" | "socio_unconfirmed" | "invalid_email" | "rate_limited";

invitePortalClientAction(input: { projectId: string; contactId: string; email: string; name: string; confirmSocio?: boolean })
  : Promise<{ ok: true; emailSent: boolean } | { ok: false; error: PortalActionError }>
```
1. Staff session + permission `portal.manageAccess` (else `forbidden`). Project must exist and not be deleted (else `not_found`).
2. The contact must be type `cliente` or `socio` and linked to the project (`projects.client_id` or a `project_contacts` row), else `not_project_contact`. A `socio` without `confirmSocio: true` → `socio_unconfirmed`.
3. Email lowercased and validated (`invalid_email`); emails on `GOOGLE_WORKSPACE_DOMAIN` → `staff_domain`.
4. Upsert `portal_users` by `lower(email)`: new → `invited`; `invited`/`active` kept; `disabled` → `disabled`.
5. An active `project_portal_access` row for (project, user) already exists → `already_active`. Otherwise insert it.
6. `portal_audit_events` (`invite`), then send the invite email (§B.6). Email failure doesn't roll back; returns `emailSent: false` and the UI offers **Reenviar invitación**.

Other actions:
- `resendPortalInviteAction(portalUserId: string, projectId: string)` → `{ ok: true; emailSent: boolean } | { ok: false; error: "forbidden" | "not_found" | "rate_limited" }`. 3 per hour per portal user, counted in `portal_audit_events` (`resend`). Needs an active access row for that project.
- `revokePortalAccessAction(accessId: string)` → `{ ok: true } | { ok: false; error: "forbidden" | "not_found" }`. Sets `revoked_at`/`revoked_by`.
- `disablePortalUserAction(portalUserId: string)` (permission `portal.disableUsers`) → same shape. Status `disabled`, deletes all `portal_sessions` and unconsumed codes.
- `enablePortalUserAction(portalUserId: string)` (permission `portal.disableUsers`) → same shape. `disabled → invited` (or `active` if it was activated before); access rows are untouched, so revoked projects stay revoked.
- `listProjectPortalAccessAction(projectId)` → `PortalAccessRow[]` (frontend §5), including revoked rows (`status: "revoked"`).
- `listProjectPortalActivityAction(projectId)` → `PortalActivityRow[]` (last 50 `portal_file_events`).
- Access is not tied to the contact link after the invite: removing the contact from the project doesn't revoke access. Staff revoke explicitly (v1).

If `drive_folder_status != 'ready'` the invite still works; the client's Archivos tab shows "Los archivos estarán disponibles pronto".

### B.4.2 Client sign-in

- `POST /api/portal/auth/code` `{ email }`:
  1. Rate limits from `portal_login_codes`: 5 per hour per email, 20 per hour per IP → 429 `{ error: "rate_limited" }`.
  2. Look up `portal_users` by `lower(email)` with status `invited|active`.
  3. Always insert a `portal_login_codes` row (unknown email: `codeHash` null) so timing and limits match.
  4. Known: generate a 6-digit code with `crypto.randomInt`, store its hash, expires in 5 minutes, send the email without awaiting it (`after()`).
  5. Same 200 response either way: `{ message: "Si tu correo tiene acceso, te enviamos un código." }`.
- `POST /api/portal/auth/verify` `{ email, code }`:
  1. Rate limit: 10 verify calls per 15 minutes per IP (in-process sliding window keyed by `X-Real-IP`) → 429 `{ error: "rate_limited" }`.
  2. Latest unconsumed, unexpired code for the email. None, null hash, or `attempts >= 3` → 400 `{ error: "invalid_code" }`.
  3. Wrong code → `attempts + 1`, same 400.
  4. Right code → `consumed_at`, portal user `invited → active` (`activated_at`), `last_login_at`, create `portal_sessions` (30 days), set cookie, 200 `{ redirect: "/portal" }`.
  5. Constant-time compare (`timingSafeEqual`).
- `POST /api/portal/auth/logout` → 204: delete the session row, clear the cookie.
- `GET /api/portal/auth/logout?next=<path>`: same, then redirect to `safeReturnTo(next, "/portal/login")`. Used by portal pages to drop a stale cookie (Server Components can't).

### B.4.3 Every portal request

```ts
requirePortalUser()        // cookie → portal_sessions (not expired) → portal_users.status = active
                            // slides expiry: if refreshed_at older than 24 h, expires_at = now + 30 d
                            // failure in a page/layout: redirect to /api/portal/auth/logout?next=/portal/login (clears the cookie)
                            // failure in an /api/portal/* route: 401 { redirect: "/portal/login" } with the cookie cleared on that response
requireProjectAccess(pid)  // active project_portal_access row for (pid, user) AND project not soft-deleted AND status <> 'cancelado'; else 404
```

- **404, not 403**, for projects without access.
- Portal pages and routes **never import staff modules** (`lib/actions/*`, `lib/repositories/*`, `lib/auth/session.ts`). They call `lib/portal/queries.ts`, which returns explicit DTOs:

```ts
// lib/types/portal.ts
type PortalProjectDTO = {
  id: string; name: string; code: string | null; address: string | null;   // address_street, address_city, address_state joined with ", " (blanks skipped)
  status: string; progressPct: number; startDate: string | null; endDate: string | null;
  manager: { name: string; email: string | null } | null;     // projects.manager_id
};
type PortalScheduleDTO = {
  sections: { key: string; planta: string; seccion: string; start: string; end: string; progressPct: number }[];
} | null;                                                       // null when the project has no schedule
type PortalFileDTO = {
  id: string; name: string; mimeType: string; sizeBytes: number | null; modifiedAt: string;
  kind: "file" | "folder"; deliveredAs: "original" | "pdf";
};
type PortalUploadDTO = { id: string; fileName: string; sizeBytes: number | null; at: string };
type PortalFolderDTO = { folderId: string; breadcrumbs: { id: string; name: string }[]; items: PortalFileDTO[] };
```

### B.4.4 List files

`GET /api/portal/projects/[pid]/files?folder=<fid>` → `PortalFolderDTO`
1. `requirePortalUser` + `requireProjectAccess(pid)`.
2. Folder status not ready → 200 `{ pending: true }`.
3. `folder = fid ?? project.drive_client_folder_id`; `assertInsideClientFolder(folder, project)` (§B.4.6).
4. Service account `files.list`: `q = '<folder>' in parents and trashed = false`, `supportsAllDrives`, `includeItemsFromAllDrives`, fields `id,name,mimeType,size,modifiedTime`.
5. Drop shortcuts and anything that isn't a folder or a file. Google-native types get `deliveredAs: "pdf"`.
6. Cache per folder for 60 s (in-process LRU).
Never return `webViewLink`, `webContentLink`, owners or permissions.

### B.4.5 Download and preview

```
GET /api/portal/projects/[pid]/files/[fileId]/download   → attachment
GET /api/portal/projects/[pid]/files/[fileId]/preview    → inline (PDF, JPEG, PNG, WebP, GIF only; SVG and everything else → 415)
```
1. `requirePortalUser` + `requireProjectAccess(pid)`.
2. `assertInsideClientFolder(fileId, project)`; folders → 400.
3. Google-native (Docs, Sheets, Slides, Drawings) → `files.export` `application/pdf`. Drive limits exports to 10 MB; on that error return 422 `{ error: "export_too_large" }` ("Este documento es muy grande; pide el PDF a tu equipo.").
4. Other files → `files.get` `alt=media`, **streamed** (`ReadableStream`, no buffering).
5. Headers: RFC 6266 `Content-Disposition` with a sanitized filename (`filename*=UTF-8''…`), `Content-Type` from Drive, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: sandbox; default-src 'none'; img-src 'self'; object-src 'self'` on both routes.
6. Insert `portal_file_events` (`download` or `preview`).

### B.4.6 Ancestry check

```ts
// lib/portal/drive-guard.ts
async function assertInsideClientFolder(fileOrFolderId: string, project: { driveClientFolderId: string }) {
  const root = project.driveClientFolderId;
  if (fileOrFolderId === root) return;
  let current = fileOrFolderId;
  for (let depth = 0; depth < 10; depth++) {
    const meta = await getParentCached(current);          // files.get fields "id,name,parents,trashed", supportsAllDrives; cache 60 s (names also feed breadcrumbs)
    if (!meta || meta.trashed) throw portalNotFound();
    const parent = meta.parents?.[0];
    if (!parent) throw portalNotFound();
    if (parent === root) return;
    current = parent;
  }
  throw portalNotFound();
}
```
**Mandatory on every list, download, preview and upload.** Drive 404 maps to portal 404. The parent cache is 60 s for the portal (not 5 min), so a file staff move out of `02 Cliente` stops being reachable within a minute.

### B.4.7 Client upload

`POST /api/portal/projects/[pid]/uploads` (multipart, one file per request)
1. `requirePortalUser` + `requireProjectAccess(pid)`; folder status must be ready (else 409 "Aún no puedes enviar archivos a este proyecto").
2. `Content-Length` ≤ 50 MB + multipart overhead, else 413 before reading the body.
3. Stream the part with `busboy`: read the first 4 KB, check the extension allowlist **and** the content; reject executables and mismatches with 415. Content checks per extension: `file-type` for binary formats (pdf, jpg, png, heic, docx/xlsx/pptx and zip as `zip`, doc/xls/ppt as `cfb`, dwg by its `AC10` header); `dxf` has no magic bytes, so it must decode as text and start (after whitespace) with `0` then `SECTION`. Count bytes and abort past 50 MB with 413.
4. Pipe the stream into a Drive **resumable upload** (service account) in `drive_inbound_folder_id`, named `YYYY-MM-DD · {client name} · {original name}` (date in America/Mexico_City). No full-file buffering.
5. `portal_file_events` (`upload`), then email the project's manager and coordinator (`after()`): file name, client, link to the `03 Del cliente` folder. If neither has an email, send it to every staff member with role Administrador.
6. 201 `PortalUploadDTO`.

- Clients can't list `03 Del cliente`. `GET /api/portal/projects/[pid]/uploads` returns only their own uploads from `portal_file_events`.
- **Body size in front of the app:** `deploy/nginx/cincel-app.conf` gets a dedicated `location ~ ^/api/portal/projects/[^/]+/uploads$` with `client_max_body_size 55m`, `proxy_request_buffering off` and `proxy_read_timeout 300s`; the rest keeps 20 MB. The Keter nginx route for the app must accept ≥ 55 MB request bodies on that path too. If the platform can't, switch to the two-step upload (server creates the resumable session in the inbound folder; browser PUTs to it; server verifies parent, size and first bytes after completion and deletes the file on failure). Decide in the infra task.

### B.4.8 Revoke and disable

| Action (staff) | Effect |
|---|---|
| Quitar acceso (one project) | `revoked_at` set; the project disappears on the client's next request |
| Revoke their last project | The client can still sign in and sees "No tienes proyectos activos" |
| Deshabilitar | `status = disabled`, all `portal_sessions` deleted, no new codes |
| Project `cancelado` or soft-deleted | Hidden from the portal; access rows kept. `completado` projects stay visible |

## B.5 Permissions

Add a module **Portal de clientes** to `permissionsRegistry`:
- `portal.manageAccess` (boolean): invite, resend, revoke, see the Clientes tab and its activity. Defaults per §0.3.
- `portal.disableUsers` (boolean): disable portal users. Default Administrador.

## B.6 Email

`lib/email/index.ts`: `sendMail({ to, subject, text, html })` over SMTP (`nodemailer`), configured by `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. Without `SMTP_HOST`, it logs the message (dev) and returns `{ sent: false }`. Templates in `lib/email/templates/*.ts` (Spanish, plain text + minimal HTML):
- **Invitación:** subject "Te invitaron a ver {Proyecto} en Cincel"; body "{Staff} te invitó a ver el proyecto {Proyecto} en Cincel. Entra con tu correo: {APP_ORIGIN}/portal/login?email={email}"
- **Código:** subject "Tu código de acceso a Cincel"; body "Tu código de acceso es {code}. Vence en 5 minutos. Si no lo pediste, ignora este correo."
- **Archivo recibido (staff):** subject "{Cliente} envió un archivo a {Proyecto}"; body "{Cliente} subió {archivo} al proyecto {Proyecto}. Está en 03 Del cliente: {folder link}"

Local `docker-compose.yml` gains a `mailpit` service (`axllent/mailpit`), and `.env.example` documents the SMTP variables. `kcd.yml` declares them (`SMTP_PASSWORD` secret; see §A.9).

## B.7 Security requirements

- Separate cookie and session table; `requirePortalUser()` reads only the portal cookie; staff helpers only the staff cookie. `middleware.ts` treats `/portal` and `/portal/*` as outside the staff redirect, and redirects `/portal/*` (except `/portal/login`) without the portal cookie to `/portal/login`. `AppRouteGuard` renders `/portal` paths without staff checks (§A.5.1).
- No account enumeration on "send code" (same response, same work).
- Codes: 6 digits, 5 min, 3 attempts, hashed; send limits per email and per IP.
- Every portal data access goes through `requirePortalUser` + `requireProjectAccess` + `lib/portal/queries.ts`. An ESLint `no-restricted-imports` rule for `app/portal/**` and `app/api/portal/**` blocks `@/lib/actions/*`, `@/lib/repositories/*` and `@/lib/auth/session`.
- Ancestry check on every file operation.
- Never return Drive links, owners or permissions to the portal.
- Upload validation: size, extension and magic bytes; files go only to the inbound folder.
- Audit: `portal_file_events` and `portal_audit_events`.

## B.8 Acceptance criteria

1. A user with `portal.manageAccess` invites `cliente@gmail.com` (a `cliente` contact of Project A); the client receives the email, signs in with a code, and sees only Project A.
2. A never-invited email gets the same "send code" response and receives nothing.
3. A file staff put in Project A's `02 Cliente` appears in the client's list within 60 s; a file in `01 Interno` never does.
4. Requesting a file ID from `01 Interno` or another project through download, preview or folder listing returns 404.
5. A Google Doc downloads as PDF; one over the 10 MB export limit shows the friendly message.
6. A client upload lands in `03 Del cliente` with the date/name prefix; manager and coordinator get the email; the event is logged.
7. A 60 MB upload and a renamed `.exe` are rejected.
8. **Quitar acceso** removes Project A on the client's next request. **Deshabilitar** signs them out everywhere and stops new codes.
9. A portal cookie sent to a staff page or action is treated as no session, and vice versa.
10. The cronograma reaches the client per section only; `tarea`, `responsable` and staff names other than the manager are absent from every portal JSON response (checked in tests, not just the UI).
11. A fourth wrong code, or a code after 5 minutes, fails; the sixth "send code" in an hour for one email returns 429.

## B.9 Phase 2 (not in v1)

- "Continuar con Google" for clients (separate External OAuth client, `openid email profile`, invited emails only).
- Daily digest to clients when `02 Cliente` changes.
- Client sign-off on specific files.

---

## 10. Testing

- **Unit (Vitest):** `evaluateAccess` (role by rank, areas replaced, suspended, no group, Directory error), token encryption round-trip, OAuth state/PKCE handling, `assertInsideClientFolder` (root, nested, other project, trashed, depth limit), code generation/verification/attempts/rate limits, filename sanitizing, upload type sniffing, portal DTO mappers (no forbidden fields), permission defaults.
- **Integration (Vitest + test Postgres):** sign-in upsert/link by email then by sub; re-check revoke deletes sessions; invite/revoke/disable; portal session sliding; staff/portal cookie isolation.
- **Guards (Vitest):** `AppRouteGuard` public paths (`/login`, `/login/denegado`, `/change-password`, `/portal/*`); revoked session → sign-out route, no loop; Google staff never `pending_first_access`; `safeReturnTo` rejects `//x`, `/\\x`, `https://x`.
- **E2E (Playwright, local):** password login keeps working with flags at defaults; portal login with a code read from Mailpit; Drive and Directory calls stubbed behind `lib/google/*` interfaces (a fake implementation selected by `GOOGLE_FAKE=1` in tests only; the app refuses to start when `GOOGLE_FAKE=1` and `NODE_ENV=production`).
- Google itself is verified manually against the client's staging groups and Shared Drive (§A.11, §B.8).

## 11. Open questions

1. Can the Keter route for the app accept 55 MB bodies (§B.4.7)? Decides streaming vs two-step upload.
4. Retention of `auth_events`, `portal_file_events` and `portal_audit_events`: kept indefinitely in v1; decide a period with the client.
2. Confirm the defaults in §0.3 with the client (group names, permission defaults, cronograma detail for clients).
3. Should `project_links` with `kind = 'cliente'` (links staff already curate for clients) also appear in the portal? v1 says no.
