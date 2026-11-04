# Google Drive integration

`/recursos` and each project's ficha can browse and pick real Drive files
instead of pasting a URL. Built in Phase 4; the auth model was corrected in
Phase 6 to match how Cincel actually shares documents. A second, independent
auth path — real OAuth account choice — was added afterward; see below.

## Two ways to authenticate to Drive

1. **Per-user impersonation** (service account, domain-wide delegation) —
   always the caller's institutional email, no choice involved. Section
   below.
2. **Real "Sign in with Google"** (`lib/google/oauth.ts`) — a user connects
   their own Google account (any account, personal or work) through Google's
   real account chooser, and can switch to a different one anytime. Optional;
   configured independently via `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`.

When a user has a connected OAuth account, every Drive call in this app uses
it; impersonation is the fallback for everyone else. See "OAuth account
choice" below for setup and code pointers.

## Model: per-user impersonation, not a shared identity

Cincel's Drive folders are shared with **different permissions per person** —
not a single Shared Drive with uniform access. So the app authenticates to
Drive **as the logged-in Cincel user** (their institutional email), via a
service account with domain-wide delegation. Google's own per-file/per-folder
permissions apply exactly as they already do outside the app: a user sees the
same files here that they'd see browsing Drive directly, no more, no less.

This means there is no single "is Drive on" toggle for content — only whether
the service account itself is configured (`isDriveConfigured()`). Whether a
*specific* user's impersonation actually works depends on the Workspace
delegation grant and their own Drive access; a user with no access to the
configured root folder simply sees an empty picker, which is correct, not a
bug.

## Setup

### 1. Google Cloud Console

- Enable the **Google Drive API** on the project.
- Create a service account (or reuse an existing one). Generate a JSON key —
  `client_email` and `private_key` from it become the env vars below.

### 2. Google Workspace Admin Console

Security → Access and data control → API controls → **Domain-wide
delegation** → Add new:

- **Client ID**: the service account's numeric client ID (Cloud Console → the
  service account → Details).
- **Scopes**: `https://www.googleapis.com/auth/drive.readonly` — **only**
  this scope. Never grant write or broader Workspace scopes to this identity.

### 3. Institutional email audit

Impersonation is keyed on `core.staff.email` — it must exactly match that
person's real Workspace email. Mismatches mean that person's Drive picker
silently returns nothing (their impersonation resolves to a non-existent or
wrong Workspace identity). Audit the roster before rollout with
`npx tsx scripts/audit-staff-emails.ts` (see below); fix mismatches in
`/equipo`.

### 4. Environment

```
GOOGLE_SA_CLIENT_EMAIL=<service-account-email>
GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_ROOT_FOLDER_ID=<a folder id the picker starts in>
```

`GOOGLE_DRIVE_ROOT_FOLDER_ID` is just the picker's starting point — it does
not grant access. Each user still only sees what they can already see under
it. When it is unset (or blank) the picker starts at the root of the Shared
Drive in `GOOGLE_SHARED_DRIVE_ID` (step 5); with neither set, browsing needs an
explicit folder.

### 5. Shared Drive for project folders

Project folders (`<project>` with `01 Interno` / `02 Cliente` /
`03 Del cliente`) live in a company **Shared Drive**, written by the service
account itself (not by impersonation). Used by the monday migration CLI
(`npm run monday`) and by the app's project folders (created with a new
project, or re-created from the project page); Staff SSO reuses it.

1. In Google Drive, create a Shared Drive (e.g. *Cincel — Proyectos*).
2. Manage members → add the service account's email
   (`GOOGLE_SA_CLIENT_EMAIL`) as **Content manager**.
3. Copy the Shared Drive id from its URL
   (`https://drive.google.com/drive/folders/<id>`) into:

```
GOOGLE_SHARED_DRIVE_ID=<shared drive id>
```

## Kill switch

Revoke the domain-wide delegation authorization in the Workspace Admin
Console (step 2) — this immediately blocks all impersonation for every user,
no code change or redeploy needed. `isDriveConfigured()` still reports "on"
until the env vars are also cleared, but every actual Drive call will fail and
degrade to the picker's empty/error state.

## Code (impersonation)

- `lib/google/client.ts` — `getDriveClientFor(userEmail)` builds (and caches,
  per email) a JWT impersonating that user. `isDriveConfigured()` is a static
  check of the service-account credentials only.
- `lib/google/drive-repository.ts` — `listFolder` / `getFileMeta` /
  `searchFiles` take a `DriveCaller` (`{ staffId, email }`); `staffId` is
  tried against a connected OAuth account first, `email` is the impersonation
  fallback.
- `app/api/google/drive/{list,file/[id]}/route.ts` — resolve the caller via
  `requireCapabilityUser()` and build the `DriveCaller` from it.
  `status/route.ts` also reports OAuth availability and the caller's
  connected email, for the picker's account bar.
- `components/recursos/DrivePickerDialog.tsx` — renders that account bar
  (connect / switch / disconnect) alongside the file browser.

## OAuth account choice

A staff member connects their own Google account from the account bar at the
top of the Drive picker — "Conectar cuenta de Google". Clicking it (or later
"Cambiar cuenta") always shows Google's real account chooser
(`prompt=select_account consent`), so switching accounts never silently
reuses whichever one was signed in last. "Desconectar" removes it and reverts
that person to institutional impersonation.

### 1. Google Cloud Console

APIs & Services → Credentials → Create an **OAuth client ID** (Web
application). Add `<app origin>/api/google/oauth/callback` as an authorized
redirect URI for every environment this runs in (local, staging, prod each
need their own origin registered).

### 2. Environment

```
GOOGLE_OAUTH_CLIENT_ID=<oauth client id>
GOOGLE_OAUTH_CLIENT_SECRET=<oauth client secret>
```

Leave both unset to keep only the service-account picker — the account bar
doesn't render at all in that case.

### 3. Storage

One row per staff member in `core.google_oauth_accounts` (access token,
refresh token, scope, expiry). Tokens are stored in plain text — this app has
no secrets-encryption layer yet (the service-account key isn't encrypted at
rest either); protect this table the same way as `auth_credentials`. A
refresh happens transparently (`lib/google/oauth.ts#getOauthAccessToken`)
whenever the stored token is within a minute of expiring, and the new token
is persisted back.

### Kill switch

Unset `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` and redeploy — `isOauthConfigured()`
goes false, the account bar disappears, and every caller falls back to
impersonation. Connected accounts' rows are left in place (harmless — nothing
reads them while unconfigured) so re-enabling later doesn't lose them.

## Recursos: Drive view and account-based previews

- **Drive tab** in `/recursos` (only when Drive is configured): an inline file
  browser (`components/recursos/DriveBrowser.tsx`, the same component the
  picker sheet uses) — folders, search, breadcrumbs and the connect / switch /
  disconnect account bar. Clicking a file opens the preview sheet.
- **Previews go through the app**, not `drive.google.com`. The old iframe of
  Drive's own `/preview` page only works if the browser is already signed into
  a Google account with access ("Sign in to your Google Account" otherwise).
  `GET /api/google/drive/file/[id]/content` fetches the bytes as the caller's
  connected account (or institutional identity) and streams them back; the
  sheet iframes that same-origin URL. Google-native docs/sheets/slides are
  exported to PDF; folders open the Drive browser at that folder.
- Only PDFs, raster images (not SVG) and plain text render inline
  (`INLINE_SAFE` in the route, `canPreviewInline` on the client). Everything
  else is a forced download with `nosniff`, since this is user-controlled
  content served from the app's own origin. Files over 25 MB are refused
  (`MAX_PREVIEW_BYTES`, 413).
- Resources that aren't Drive links, or any deployment without Drive
  configured, keep the previous iframe behaviour.

## Google Calendar sync (#434)

Two ways to get tasks (compromisos, revisiones, entregas) into Google
Calendar, both from Calendario → "Sincronizar con Google Calendar":

1. **Direct sync** (needs the OAuth client above). The user connects their
   Google account with the extra scope
   `https://www.googleapis.com/auth/calendar.app.created`, requested only at
   that moment (`/api/google/oauth/start?scope=calendar`, an incremental grant
   with `include_granted_scopes`). That scope only lets the app see and edit
   calendars it created — never the rest of the user's agenda. The app creates
   a calendar named "Cincel" and pushes one all-day event per task date.
2. **Subscription link** (ICS, always available). A private URL Google polls
   every few hours; see `app/api/calendario/feed/[file]/route.ts`.

Direct sync is one-way (the app is the source of truth) and incremental:
`google_calendar_events` stores which Google event mirrors which app event
plus a hash of what was pushed, so a sync only creates, patches or deletes
what changed (`lib/google/calendar-sync.ts`). It runs when the user presses
"Sincronizar ahora" and automatically when they open Calendario (at most every
5 minutes). If the user deletes the "Cincel" calendar in Google, the next sync
creates a new one; events deleted by hand are put back when they change.
Turning sync off leaves the calendar in Google.

### Google Cloud Console

Enable the **Google Calendar API** in the same project as the OAuth client,
and add the `calendar.app.created` scope to the OAuth consent screen. No new
environment variables.

## Staff Google sign-in (Staff SSO)

Staff can sign in with **Entrar con Google**; Workspace groups decide who gets
in and with which role and areas. It ships behind two flags, both read
server-side (never `NEXT_PUBLIC_*`; `lib/auth/auth-flags.ts`):

| Flag | Default | Effect |
|---|---|---|
| `AUTH_GOOGLE_ENABLED` | `false` | Shows **Entrar con Google** and enables `/api/auth/google/*` |
| `AUTH_PASSWORD_ENABLED` | `true` | Shows the email/password form and enables login, first access and change password |

Only `true` / `false` change a flag; an unset or unrecognised value keeps the
default. With the defaults, password login, the Drive picker and Calendar
sync behave exactly as before.

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
- The password form is hidden; login, first access and change password are
  refused server-side (404), and `/change-password` redirects.
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

**5. Cleanup (later, its own release)**

After step 3 has run in production: the delegation client, the old connect
flow and legacy `google_oauth_accounts` rows without `google_sub` are removed.

The full cutover is in `docs/specs/backend.md` §A.8–§A.9.
