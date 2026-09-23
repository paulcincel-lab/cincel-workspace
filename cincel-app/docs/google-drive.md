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
it.

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
