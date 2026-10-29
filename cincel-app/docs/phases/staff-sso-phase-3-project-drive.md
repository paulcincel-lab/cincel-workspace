# Staff SSO Phase 3: Project Drive Folders + Staff Drive

## Goal
Every project gets its Shared Drive folder (`01 Interno` / `02 Cliente` / `03 Del cliente`) automatically, and staff browse it in a new Archivos tab, plus the Recursos picker and Calendar, with their own Google token instead of domain-wide delegation.

## Deliverables

### Backend
- [ ] `lib/google/drive-admin.ts`: service-account Drive client (create folder, rename, get parents, list, get media, export, resumable upload) with `supportsAllDrives` (BE §A.6.1). Part B reuses it
- [ ] `ensureProjectFolders(projectId)` idempotent; called via `after()` from `createProject`; failure → `failed` + `drive_folder_error`; folder name rules; rename on name/code change (BE §A.6.1)
- [ ] `retryProjectFolderAction(projectId)` (`canEditProjectGeneral`) and `ensureMissingProjectFoldersAction()` (Administrador) (BE §A.6.1, §A.7)
- [ ] Incremental consent: `/api/auth/google/start?scope=drive|calendar&return_to=` with `include_granted_scopes`, `access_type=offline`, `prompt=consent`, `login_hint`; callback for a signed-in staff member updates tokens/scope, `sub` must match; password-session staff run the full gate and get linked (BE §A.6.2)
- [ ] Consent-callback gate denial for a password session: keep the session, store no tokens, redirect to `return_to?google_connected=error&motivo=…` (review NB 6)
- [ ] Token row rule (review NB 5): `staff_token` mode reads only rows with `google_sub` set (encrypted); delegation / old-connect path only rows with `google_sub` null and skips encrypted rows if the flag is turned back off
- [ ] `invalid_grant` on refresh clears tokens and scope (BE §A.6.2)
- [ ] `GET /api/proyectos/[id]/archivos?folder=` → `StaffFilesResult`, ancestry walk with the service account (depth 10, cache 5 min), list with the staff token, 401/404 rules (BE §A.6.3)
- [ ] Picker routes `app/api/google/drive/*` pick the client by flag; 403 `{ error: "needs_consent" }` without grant; `status` → `{ configured, mode, hasDriveGrant, googleLinked }` (BE §A.6.3)
- [ ] Calendar sync uses the staff token with `calendar.app.created`; existing `google_calendar_syncs` rows reattach (BE §A.3, §A.6.2)
- [ ] Tests: folder idempotency, archivos states, picker in both modes, consent link for password users (§A.11 #8, #9, #15, #16)

### Frontend
- [ ] `components/proyectos/ProjectSectionNav.tsx` (Ficha · Cronograma · Archivos · Clientes; Clientes hidden until Client Portal Phase 1 adds the permission) on all project pages (FE §2.3)
- [ ] `/proyectos/[id]/archivos` + `ProjectFilesBrowser`: states `pending`, `failed` (+ **Reintentar carpeta**), `needs_consent` (**Conectar Google Drive**), `no_drive_access`, `ok` with `Breadcrumb` + `DataTable`, subfolder hints, **Abrir en Drive** (FE §2.3)
- [ ] Recursos picker: `staff_token` mode shows **Conectar Google Drive**, handles 403 `needs_consent`, hides the account switcher; `delegation` mode unchanged (FE §2.7)
- [ ] Calendario connect button → `/api/auth/google/start?scope=calendar&return_to=/calendario`; show the `google_connected=error` result inline (FE §2.7)
- [ ] Configuración → Google **Carpetas de proyectos** section with **Crear carpetas faltantes** and result summary (FE §2.5 section 3)
- [ ] Vitest: Archivos states (FE §10, §11 #3)

### Infrastructure
- [ ] `GOOGLE_SHARED_DRIVE_ID` and `GOOGLE_DRIVE_ROOT_FOLDER_ID` default documented (BE §A.6.3, §A.9)
- [ ] Shared Drive "Cincel Proyectos" created by the client with `cincel-todos` and the service account as Content managers (BE §A.9 item 7)

## Done Definition
- Creating a project creates the folder and three subfolders; a Drive failure leaves the project usable with **Reintentar carpeta** (§A.11 #8)
- **Crear carpetas faltantes** fills in existing projects and reports counts
- Archivos asks for Drive once, then lists with the user's token; no Drive access → "No tienes acceso a esta carpeta en Drive" (§A.11 #9)
- With `AUTH_GOOGLE_ENABLED=false`, picker and Calendar sync work exactly as before (§A.11 #15); flipping the flag back off doesn't break Drive
- A password-session user clicking **Conectar Google Drive** gets linked and their Drive works (§A.11 #16)

## Parallel work
- Can run in parallel with Staff SSO Phase 2
- BE: `drive-admin.ts` + folder creation can start first and unblocks Client Portal Phase 2; consent + archivos route alongside FE: `ProjectSectionNav` + `ProjectFilesBrowser` against the `StaffFilesResult` type
- FE picker / Calendar changes run alongside BE picker-route mode switch

## Phase dependencies
- Requires: Staff SSO Phase 1 (schema drive columns, service account, staff OAuth, token crypto, Configuración → Google page)

## Complexity
- Backend: L
- Frontend: M
- Infra: S

## Risks
- Two token formats coexist until Phase 4; mixing them breaks Drive for someone (NB 5 rule must be tested)
- Shared Drive permissions on the client side; folder creation fails until the service account is a member
