# Google Drive integration

`/recursos`, each project's ficha and its Archivos tab browse and pick real
Drive files instead of pasting a URL. Two Google identities are involved, each
acting as itself:

1. **The staff member's own token.** Granted through Google sign-in consent
   (`lib/google/staff-oauth.ts`, `lib/google/staff-token.ts`). The Drive
   picker, previews, the project Archivos listing and Calendar sync all run
   as the signed-in staff member, so Drive's own sharing decides what they see:
   the same files here as in Drive, no more, no less.
2. **The `cincel-directory` service account, acting as itself**
   (`lib/google/service-account.ts`). It reads Workspace users and groups for
   sign-in, creates project folders in the company Shared Drive, checks that a
   requested folder belongs to the project, and serves the client portal's
   files. It is a Content manager of that Shared Drive and nothing more.

## Setup

The full client-side list is in `docs/google-workspace-admin-checklist.md`.
For Drive:

### 1. Google Cloud Console

- In the company's Cloud project, enable the **Google Drive API**, the
  **Admin SDK API** and, for Calendar sync, the **Google Calendar API**.
- OAuth consent screen: user type **Internal**; add the
  `https://www.googleapis.com/auth/drive.readonly` and
  `https://www.googleapis.com/auth/calendar.app.created` scopes.
- OAuth client (Web application) with the redirect URI
  `<APP_ORIGIN>/api/auth/google/callback` for every environment (prod and
  staging).
- Service account `cincel-directory` with a JSON key; `client_email` and
  `private_key` from it become `GOOGLE_SA_CLIENT_EMAIL` /
  `GOOGLE_SA_PRIVATE_KEY`. In the Workspace Admin Console assign it the
  custom read-only role "Cincel directory reader" (read Users, read Groups).

### 2. Environment

```
GOOGLE_OAUTH_CLIENT_ID=<oauth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<oauth client secret>
GOOGLE_SA_CLIENT_EMAIL=<service-account-email>
GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHARED_DRIVE_ID=<shared drive id>
GOOGLE_DRIVE_ROOT_FOLDER_ID=<a folder id the picker starts in>
```

The other sign-in variables (`APP_ORIGIN`, `GOOGLE_WORKSPACE_DOMAIN`,
`TOKEN_ENCRYPTION_KEY`, …) are under "Staff Google sign-in" below.

`GOOGLE_DRIVE_ROOT_FOLDER_ID` is just the picker's starting point; it does
not grant access. Each staff member still only sees what they can already see
under it. When it is unset (or blank) the picker starts at the root of the
Shared Drive in `GOOGLE_SHARED_DRIVE_ID`; with neither set, browsing needs an
explicit folder.

### 3. Shared Drive for project folders

Project folders (`<project>` with `01 Interno` / `02 Cliente` /
`03 Del cliente`) live in a company **Shared Drive**, written by the service
account itself. Used by the monday migration CLI (`npm run monday`), by the
app's project folders (created with a new project, or re-created from the
project page) and by the client portal.

1. In Google Drive, create a Shared Drive (e.g. *Cincel — Proyectos*).
2. Manage members → add `cincel-todos` and the service account's email
   (`GOOGLE_SA_CLIENT_EMAIL`), both as **Content manager**.
3. Copy the Shared Drive id from its URL
   (`https://drive.google.com/drive/folders/<id>`) into
   `GOOGLE_SHARED_DRIVE_ID`.

## Staff Drive consent

Signing in with Google asks only for `openid email profile`. Drive is an
incremental grant: the picker or Archivos shows **Conectar Google Drive**
when the staff member has not granted it yet, which goes to
`/api/auth/google/start?scope=drive` (`drive.readonly`, `prompt=consent`,
`include_granted_scopes`). The scope is read-only; the app never writes to
Drive as a staff member.

- Tokens are stored encrypted (`TOKEN_ENCRYPTION_KEY`) in
  `core.google_oauth_accounts`, one row per staff member, with `google_sub`
  set. A refresh happens whenever the stored token is within a minute of
  expiring, and the new token is persisted back.
- A refresh that Google refuses (`invalid_grant`: revoked access, password
  change) clears the tokens and scope; the routes answer
  `403 { error: "needs_consent" }` and the UI shows **Conectar Google Drive**
  again.
- A staff member can revoke the app at any time from their Google Account →
  Security → Third-party connections.

## Code

- `lib/google/picker-drive.ts` resolves the Drive caller for the picker routes
  from the staff member's token; no grant means `403 needs_consent`, no OAuth
  client means `503`.
- `lib/google/drive-repository.ts` — `listFolder` / `getFileMeta` /
  `searchFiles` with that caller.
- `app/api/google/drive/{list,file/[id],file/[id]/content}/route.ts` — the
  picker routes, behind `requireCapabilityUser()`. `status/route.ts` reports
  `mode: "staff_token"` and whether the picker is configured.
- `app/api/proyectos/[id]/archivos` (`lib/google/staff-files.ts`) — the
  service account confirms the folder sits under the project folder (parent
  walk, cached 5 min) and yields the breadcrumbs; the listing itself runs with
  the staff member's token.
- `components/recursos/DriveBrowser.tsx` / `DrivePickerDialog.tsx` — the
  file browser and the **Conectar Google Drive** state.

## Recursos: Drive view and previews

- **Drive tab** in `/recursos` (only when Drive is configured): an inline file
  browser (`components/recursos/DriveBrowser.tsx`, the same component the
  picker sheet uses) with folders, search and breadcrumbs. Clicking a file
  opens the preview sheet.
- **Previews go through the app**, not `drive.google.com`. An iframe of
  Drive's own `/preview` page only works if the browser is already signed into
  a Google account with access. `GET /api/google/drive/file/[id]/content`
  fetches the bytes with the staff member's token and streams them back; the
  sheet iframes that same-origin URL. Google-native docs/sheets/slides are
  exported to PDF; folders open the Drive browser at that folder.
- Only PDFs, raster images (not SVG) and plain text render inline
  (`INLINE_SAFE` in the route, `canPreviewInline` on the client). Everything
  else is a forced download with `nosniff`, since this is user-controlled
  content served from the app's own origin. Files over 25 MB are refused
  (`MAX_PREVIEW_BYTES`, 413).
- Resources that aren't Drive links, or any deployment without Drive
  configured, keep the previous iframe behaviour.

## Kill switch

Unset `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` and redeploy: the picker routes
answer 503 and the UI degrades to manual URL entry. Note this also turns off
**Entrar con Google**. To stop only the service account (project folders,
Directory reads, the client portal's files), disable or delete its key in
Cloud Console.

## Google Calendar sync (#434)

Two ways to get tasks (compromisos, revisiones, entregas) into Google
Calendar, both from Calendario → "Sincronizar con Google Calendar":

1. **Direct sync.** The staff member grants the extra scope
   `https://www.googleapis.com/auth/calendar.app.created` only at that moment
   (**Conectar Google Calendar** → `/api/auth/google/start?scope=calendar`, an
   incremental grant with `include_granted_scopes`). That scope only lets the
   app see and edit calendars it created, never the rest of the agenda. The
   app creates a calendar named "Cincel" and pushes one all-day event per task
   date.
2. **Subscription link** (ICS, always available). A private URL Google polls
   every few hours; see `app/api/calendario/feed/[file]/route.ts`.

Direct sync is one-way (the app is the source of truth) and incremental:
`google_calendar_events` stores which Google event mirrors which app event
plus a hash of what was pushed, so a sync only creates, patches or deletes
what changed (`lib/google/calendar-sync.ts`). It runs when the user presses
"Sincronizar ahora" and automatically when they open Calendario (at most every
5 minutes). If the user deletes the "Cincel" calendar in Google, the next sync
creates a new one; events deleted by hand are put back when they change.
Turning sync off leaves the calendar in Google. `google_calendar_syncs` rows
are keyed by staff id, so granting Calendar again reattaches the existing sync.

## Staff Google sign-in (Staff SSO)

Staff can sign in with **Entrar con Google**; Workspace groups decide who gets
in and with which role and areas. It ships behind two flags, both read
server-side (never `NEXT_PUBLIC_*`; `lib/auth/auth-flags.ts`):

| Flag | Default | Effect |
|---|---|---|
| `AUTH_GOOGLE_ENABLED` | `false` | Shows **Entrar con Google** and enables `/api/auth/google/*` |
| `AUTH_PASSWORD_ENABLED` | `true` | Shows the email/password form and enables login, first access and change password |

Only `true` / `false` change a flag; an unset or unrecognised value keeps the
default. Drive and Calendar only work with a staff member's own token, which
needs `AUTH_GOOGLE_ENABLED=true`.

### Environment

```
AUTH_GOOGLE_ENABLED=true
AUTH_PASSWORD_ENABLED=true
APP_ORIGIN=https://<app host>                    # builds OAuth redirect URIs; not taken from the request
GOOGLE_OAUTH_CLIENT_ID=<oauth client id>         # staff OAuth client (Internal), existing var
GOOGLE_OAUTH_CLIENT_SECRET=<oauth client secret>
GOOGLE_WORKSPACE_DOMAIN=<workspace domain>       # checked against the ID token's hd
GOOGLE_WORKSPACE_CUSTOMER_ID=<customer id>       # optional, for groups.get
GOOGLE_SA_CLIENT_EMAIL=<service-account-email>   # existing var
GOOGLE_SA_PRIVATE_KEY=<private key>              # existing var; never committed
GOOGLE_SHARED_DRIVE_ID=<shared drive id>         # see "Shared Drive for project folders"
TOKEN_ENCRYPTION_KEY=<64 hex chars>              # AES-256 key, e.g. `openssl rand -hex 32`
ACCESS_RECHECK_HOURS=4
```

- `TOKEN_ENCRYPTION_KEY` encrypts OAuth tokens at rest (32 bytes as hex; the
  Keter recipe `kcd.yml` generates it with `generate: hex32`). Ciphertext is
  prefixed `v1:` so a later key rotation can add `v2`; rotation itself is out
  of scope.
- Secrets: `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_SA_PRIVATE_KEY`,
  `TOKEN_ENCRYPTION_KEY`. Keep them in the platform's secret store or
  `.env.production`, never in the repo.
- Register the redirect URI `<APP_ORIGIN>/api/auth/google/callback` on the
  OAuth client for every environment (prod and staging).

### Access re-check

Every `ACCESS_RECHECK_HOURS` (default `4`) the first request of a staff member
linked to Google re-checks their Workspace groups (`lib/auth/access-recheck.ts`).
Removed from every role group, or suspended, means their sessions are deleted
and they land on `/login/denegado?motivo=revoked`; otherwise role and áreas are
refreshed. A Directory error keeps access and retries about 5 minutes later.
An unset, non-numeric, zero or negative value falls back to `4`; fractions
work (`0.5` = 30 minutes). Staff without Google (password only, e.g. the
bootstrap admin) are never re-checked. **Revisar acceso ahora** in Equipo
(Administrador) ignores the interval.

### Cutover runbook (passwords → Google)

Env changes are made in the KCD console (the app's environment there), then
the app is redeployed so the new values are read. Do every step on staging
first, then on production.

**Before you start**

- The client's Workspace setup is done (`docs/google-workspace-admin-checklist.md`):
  role groups, area groups, OAuth client with the redirect URI for this
  environment, service account with the directory reader role.
- The Google variables above are set, and Configuración → Google → **Estado**
  shows no Directory error.
- Keep the bootstrap admin values (`BOOTSTRAP_ADMIN_EMAIL`,
  `BOOTSTRAP_ADMIN_PASSWORD`) somewhere safe; they are the break-glass account.

**1. Both login methods on**

- Set `AUTH_GOOGLE_ENABLED=true` and `AUTH_PASSWORD_ENABLED=true`, redeploy.
- The login page shows **Entrar con Google** and the email/password form.
- Ask every staff member to sign in once with **Entrar con Google**. Their row
  gets `google_sub`; from then on role and áreas come from Workspace and are
  read-only in Equipo / Áreas.
- Anyone who lands on `/login/denegado` is not in a role group: fix it in
  Google Admin, then they try again.

**2. Wait for everyone**

- Configuración → Google → **Estado** shows "N de M colaboradores activos ya
  entraron con Google".
- While both flags are on, password users keep working. Drive and Calendar use
  each staff member's own token; a password user links Google by granting
  Drive or by signing in with Google.
- **Do not go to step 3 until N equals M.** Whoever is missing is locked out
  once passwords are off. Deactivate staff who no longer work here instead of
  waiting for them.

**3. Passwords off**

- Set `AUTH_PASSWORD_ENABLED=false`, redeploy.
- The password form is hidden; the login, first access and change password
  actions refuse server-side and return `password_login_disabled`, and
  `/change-password` redirects.
- With the flag false the migrate job skips the bootstrap admin
  (`bootstrap admin <email>: skipped, passwords disabled`), so a deploy does
  not turn its password back on.
- Disable the stored passwords of staff who signed in with Google, with the
  app's `DATABASE_URL`:

  ```
  npx tsx scripts/disable-passwords.ts
  ```

  It sets `auth_credentials.enabled = false` and
  `must_change_password = false` only for staff with `google_sub`. It is
  idempotent: running it again changes nothing.
- Check: a Google sign-in works, the password form is gone, and an old
  password no longer gets in.

**4. Break-glass (Google sign-in broken)**

Use this when nobody can get in with Google (OAuth client deleted, Directory
down for long, wrong domain).

- In the KCD console set `AUTH_PASSWORD_ENABLED=true` and the bootstrap
  admin `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, then redeploy.
- The migrate job creates or re-enables that admin as Administrador with the
  password from the env; sign in with it on the password form. Password login
  also works again for any credential still `enabled` (the ones
  `disable-passwords.ts` turned off stay off).
- Fix the Google side, confirm **Entrar con Google** works, then repeat step 3
  (`AUTH_PASSWORD_ENABLED=false`, redeploy). Change or clear
  `BOOTSTRAP_ADMIN_PASSWORD` afterwards.

**5. Cleanup (its own release)**

Shipped after step 3 ran in production: Drive and Calendar use staff tokens
only, and legacy `google_oauth_accounts` rows without `google_sub` are deleted
by a migration. Confirm the client finished item 8 of
`docs/google-workspace-admin-checklist.md`.

The full cutover is in `docs/specs/backend.md` §A.8–§A.9.
