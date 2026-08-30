# Google Drive integration

`/recursos` and each project's ficha can browse and pick real Drive files
instead of pasting a URL. Built in Phase 4; the auth model was corrected in
Phase 6 to match how Cincel actually shares documents.

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

Impersonation is keyed on `team_members.institutional_email` — it must
exactly match that person's real Workspace email. Mismatches mean that
person's Drive picker silently returns nothing (their impersonation resolves
to a non-existent or wrong Workspace identity). Audit the roster before
rollout; fix mismatches in `equipo`.

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

## Code

- `lib/google/client.ts` — `getDriveClientFor(userEmail)` builds (and caches,
  per email) a JWT impersonating that user. `isDriveConfigured()` is a static
  check of the service-account credentials only.
- `lib/google/drive-repository.ts` — `listFolder` / `getFileMeta` /
  `searchFiles` all take `userEmail` as their first argument.
- `app/api/google/drive/{list,file/[id]}/route.ts` — resolve the caller via
  `requireCapabilityUser()` and pass `caller.email` through. `status/route.ts`
  stays a static "is the SA configured" check (`getSession()` only).
- `components/recursos/DrivePickerDialog.tsx` / `lib/google/use-drive-enabled.ts`
  — unchanged; they already just render whatever the API returns, which is
  now naturally per-user.
