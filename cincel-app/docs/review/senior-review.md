VERDICT: APPROVED

# Senior review (round 2): Staff Google Sign-in + Client Portal

**Reviewed:** the revised `docs/specs/backend.md` (759 lines) and `docs/specs/frontend.md` (250 lines), checked again against `cincel-app` on `main` (760aff1): `app/layout.tsx`, `components/auth/AppRouteGuard.tsx`, `middleware.ts`, `lib/auth/session.ts`, `lib/repositories/auth-repository.ts`, `lib/db/schema/*`, `app/api/google/*`, `deploy/nginx/cincel-app.conf`.
**Scope:** design within the settled decisions of backend §0.2. Existing CI is out of scope; the specs add no CI work (Playwright stays local).

## Round-1 blockers: status

| # | Round-1 blocker | Status | Where |
|---|---|---|---|
| 1 | Route guard blocks `/portal/*` and `/login/denegado` | Resolved | BE §A.5.1, §B.7; FE §2.2, §10 |
| 2 | Stale cookie → `/login` ↔ `/dashboard` loop | Resolved | BE §A.5.1 (sign-out route, middleware shortcut removed), §A.11 #13 |
| 3 | `must_change_password` trap | Resolved | BE §A.4 "No password state", §A.5.1 `/change-password`, §A.8 step 3, §A.11 #14 |
| 4 | Staff name unique-index collision | Resolved | BE §A.4 resolution order with `needs_link`; FE §2.2 |
| 5 | Rollout breaks Drive/Calendar; password users can't grant Drive | Resolved | BE §A.3 migration note, §A.6.2, §A.6.3 (mode by flag), §A.8 steps 2 and 5, §A.11 #15–16 |
| 6 | `return_to` open redirect | Resolved | BE §A.10 `safeReturnTo`, §A.11 #17, §10 Guards |
| 7 | Staff Archivos response contract | Resolved | BE §A.6.3 = FE §5 `StaffFilesResult`, field for field |
| 8 | `retryProjectFolderAction` missing | Resolved | BE §A.6.1 = FE §2.3, §7.1 |
| 9 | Invite action contract | Resolved | BE §B.4.1 `PortalActionError` = FE §5, §2.4 copy map |
| 10 | Portal 401 / error codes | Resolved | BE §B.4.2, §B.4.3 = FE §7.2 |
| 11 | Picker `needs_consent` / status shape | Resolved | BE §A.6.3 = FE §2.7, §7.1 |

---

## Blocking Issues

None.

---

## Non-Blocking Issues

1. **The preview CSP will probably stop PDFs from rendering** (BE §B.4.5 step 5). Chromium's built-in PDF viewer, and Firefox's pdf.js, generally refuse to render a document served with `Content-Security-Policy: sandbox` (the round-1 review recommended it). **Ver** on a PDF, the main preview case, would show a blocked or blank page. Fix: send `sandbox` only on image previews and on `download`. For `application/pdf` previews, send `default-src 'none'; object-src 'self'` without `sandbox`. Test **Ver** for PDFs in Chrome, Safari and Firefox before shipping.
2. **Where the stale-cookie redirect runs is ambiguous** (BE §A.5.1). The first bullet says every "session missing or expired" outcome redirects through `/api/auth/signout?next=/login`. The root layout calls `getSessionAccess()` on every page, so taken literally, someone with a stale staff cookie on `/portal/*` would be sent to the staff login. Say that only `AppRouteGuard`, on non-public paths, sends guests to sign-out. Server helpers redirect through sign-out only for `revoked`/`inactive`. The guard should use a hard navigation (`window.location.assign`), not `router.replace` to a route handler.
3. **Sign-out fallback and encoding** (BE §A.5.1, §A.10). `safeReturnTo`'s default fallback is `/dashboard`. For `/api/auth/signout` it should be `/login`. Also URL-encode the nested target: `next=%2Flogin%2Fdenegado%3Fmotivo%3Drevoked`.
4. **GET sign-out routes can be triggered cross-site** (`/api/auth/signout`, `GET /api/portal/auth/logout`). Any page can log a user out with an `<img>`. The impact is low; accept it explicitly, or require `Sec-Fetch-Site: same-origin`/`none` on the GET variants.
5. **Plaintext and encrypted token rows coexist** (BE §A.3, §A.6.3). The A.3 comment says tokens "become ciphertext", but legacy plaintext rows stay until step 5, and the old connect flow keeps writing plaintext while the flag is off. State the rule:
   - Readers in `staff_token` mode use only rows with `google_sub` set (encrypted).
   - The delegation/old-connect path uses only rows with `google_sub` null.
   - If the flag goes from true back to false, the old code must skip encrypted rows, or a staff member's Drive breaks.
6. **A gate denial in the consent callback for a password session** (BE §A.6.2). If the token passes the email check but fails the gate (`no_role_group`, suspended), the spec doesn't say what happens to the existing password session or where the browser goes. Suggest: keep the session, don't store tokens, and redirect to `return_to?google_connected=error&motivo=…`.
7. **Portal permissions module** (BE §B.5). It needs a capability type, a resolver and per-role defaults in `lib/auth/permissions.ts`, like the other modules in `permissionsRegistry`. The spec names only the two keys.
8. **The ESLint rule doesn't cover portal components** (BE §B.7). It covers `app/portal/**` and `app/api/portal/**`, but not `components/portal/**` or `lib/portal/**`, where the imports FE §4 forbids would actually happen.
9. **Numbering:** BE §A.11 runs 1–11, 13–17, then 12, and BE §11 open questions run 1, 4, 2, 3. Renumber.
10. **Carried from round 1:**
    - The invite link still puts the client's email in the query string (BE §B.6).
    - `project_portal_access` and `portal_login_codes` are updated in place without `...stamps`.
    - `kcd.yml` depends on an unmerged change (BE §A.9 now says so).
    - Keter's 55 MB body limit is still open question 1. The repo's own nginx change is now specified.
11. **`accessRevokedReason` comment** (BE §A.3): it lists 3 values, but re-check can also record `inactive` (the §A.5 diagram). Point it at the shared reason enum in §A.4.

---

## API Contract Diff

```
✅ GET  /api/auth/google/start                        — both; safeReturnTo; scope drive|calendar
✅ GET  /api/auth/google/callback                     — both; /login?error=state|retry, /login/denegado?motivo= (8 motivos, same list)
✅ GET  /api/auth/signout?next=                       — both (BE §A.5.1, FE §7.1); fallback should be /login (NB 3)
✅ GET  /api/proyectos/[id]/archivos                  — both; StaffFilesResult identical; 401/404
✅ GET  /api/google/drive/list|file/[id]|content      — both; 403 {error:"needs_consent"} in staff_token mode; 401 = no session
✅ GET  /api/google/drive/status                      — both; {configured, mode, hasDriveGrant, googleLinked}
✅ retryProjectFolderAction(projectId)                — both; canEditProjectGeneral
✅ listProjectPortalAccessAction(projectId)           — both; includes revoked rows
✅ invitePortalClientAction                           — both; confirmSocio?, PortalActionError identical
✅ resendPortalInviteAction(portalUserId, projectId)  — both
✅ revokePortalAccessAction(accessId)                 — both
✅ disablePortalUserAction / enablePortalUserAction   — both; portal.disableUsers
✅ listProjectPortalActivityAction(projectId)         — both
✅ list/create/update/deleteGroupMappingAction        — both; error codes identical; Administrador only
✅ recheckStaffAccessAction(staffId)                  — both
✅ ensureMissingProjectFoldersAction()                — both; {created, failed, skipped}
✅ getGoogleHealthAction()                            — both; GoogleHealth
✅ POST /api/portal/auth/code                         — both; 200 {message}, 429 rate_limited
✅ POST /api/portal/auth/verify                       — both; 400 invalid_code, 429 rate_limited
✅ POST /api/portal/auth/logout                       — both; 204
✅ GET  /api/portal/auth/logout?next=                 — both
✅ GET  /api/portal/projects/[pid]/files              — both; PortalFolderDTO | {pending:true}; 401 {redirect}; 404
⚠️  GET  /api/portal/projects/[pid]/files/[id]/preview — both; CSP sandbox likely blocks PDF rendering (NB 1)
✅ GET  /api/portal/projects/[pid]/files/[id]/download — both
✅ POST /api/portal/projects/[pid]/uploads            — both; 201/404/409/413/415
✅ GET  /api/portal/projects/[pid]/uploads            — both
```

---

## Data Model Review

```
✅ core.staff (additions)            — google_sub index now partial on deleted_at; needs_link avoids the name-index 500
✅ core.workspace_group_mappings      — fine; soft-deleted areas ignored by the sync
✅ core.area_members.source           — sync replaces areas only once an area mapping exists
✅ core.projects (drive_* columns)    — folder name fallback defined
⚠️  core.google_oauth_accounts        — no purge until step 5 (good); plaintext/ciphertext reader rule unstated (NB 5)
✅ core.auth_credentials              — must_change_password cleared for Google staff
✅ core.auth_events                   — retention is open question 4
✅ core.portal_users                  — enable/disable both defined
✅ core.portal_sessions               — fine
⚠️  core.portal_login_codes           — mutable without stamps (NB 10)
⚠️  core.project_portal_access        — mutable without stamps (NB 10)
✅ core.portal_file_events            — fine
✅ core.portal_audit_events           — fine
```

Migration: the Part A migration is additive (nullable or defaulted columns, new tables), so rolling the app back is safe. The only destructive step, the legacy token purge, now ships in its own cleanup release (§A.8 step 5).

---

## Frontend Architecture Notes

- **Guard:** the public-route model now spans middleware, `AppRouteGuard` and the pages, which is correct. Keep the public list in one module both files import, so the two can't drift.
- **`/login` page:** `app/login/page.tsx` is currently `"use client"`. Reading flags as server props and redirecting `active` sessions on the server means splitting it into a server page plus a client form.
- **Feedback:** inline `Alert` instead of toasts matches the app (no toast library). The new shadcn primitives are listed (FE §6).
- **Project nav:** `ProjectSectionNav` fills a real gap. Hide **Clientes** with the same capability check the server uses.

## Backend Architecture Notes

- **Re-check:** the conditional `update … returning` claim replaces the advisory transaction lock. Backoff is persisted in `access_checked_at`, and Directory calls run in parallel with timeouts. All good.
- **Revocation in route handlers:** existing API routes wrap `requireCapabilityUser()` in `try/catch`, so a `redirect()` thrown during revocation becomes their 401. That's the right outcome for `fetch` callers; keep it that way rather than letting the redirect escape.
- **Drive mode by flag:** gives a clean rollout and rollback, as long as the token rule in NB 5 is written down.
- **Uploads:** the per-path nginx limit, `proxy_request_buffering off` and the per-extension content checks are now concrete.

---

## Recommended Edits

No blocking issues. Suggested text for the two most valuable non-blocking fixes:

**NB 1:** PDF preview under CSP sandbox.
**Edit in:** `docs/specs/backend.md` → §B.4.5 step 5
**Change:**
```
CSP: `download` and image previews send `Content-Security-Policy: sandbox; default-src 'none'`.
PDF previews send `Content-Security-Policy: default-src 'none'; object-src 'self'` (no `sandbox`:
browser PDF viewers refuse sandboxed documents). Verified manually in Chrome, Safari and Firefox.
```

**NB 2 + 3:** Sign-out trigger and fallback.
**Edit in:** `docs/specs/backend.md` → §A.5.1 first and third bullets
**Change:**
```
- Server helpers redirect through /api/auth/signout only for `revoked` / `inactive`. A missing or
  expired session row is handled by AppRouteGuard on non-public paths, which does
  `window.location.assign("/api/auth/signout?next=%2Flogin")`. /api/auth/signout uses
  `safeReturnTo(next, "/login")`.
```
