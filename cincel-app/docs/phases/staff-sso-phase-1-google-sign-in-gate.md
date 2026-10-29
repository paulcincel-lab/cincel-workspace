# Staff SSO Phase 1: Google Sign-in + Access Gate

## Goal
Staff sign in with **Entrar con Google** (behind `AUTH_GOOGLE_ENABLED`), Workspace groups decide who gets in and with which role and areas, refusals land on `/login/denegado` with no session, and admins can configure the group mappings, while password login keeps working unchanged.

## Deliverables

### Backend
- [ ] Part A migration (BE §A.3), additive only: `core.staff` (`google_sub` + partial unique index, `access_checked_at`, `access_revoked_at`, `access_revoked_reason`, `last_login_at`), `core.workspace_group_mappings` + `group_mapping_kind` enum, `core.area_members.source`, `core.google_oauth_accounts.google_sub`, `core.auth_events`. One migration so Phases 2 and 3 don't touch the schema
- [ ] `accessRevokedReason` comment points at the shared denial-reason list of §A.4 (review NB 11); export the `motivo` list as a shared constant in `lib/types/workspace-access.ts`
- [ ] `lib/google/service-account.ts` (no subject) and `lib/google/directory.ts` (`getUserStatus`, `hasMember`, `getGroup`), parallel calls with 5 s timeouts (BE §A.4)
- [ ] `lib/google/token-crypto.ts`: AES-256-GCM, `v1:<iv>:<tag>:<data>`, `TOKEN_ENCRYPTION_KEY` (BE §A.3, §A.9)
- [ ] `lib/google/staff-oauth.ts`: auth URL (state + PKCE in 10-min httpOnly cookie, `hd`, `prompt=select_account`), code exchange, `verifyIdToken`, `hd` + `email_verified` server-side (BE §A.4, §A.10)
- [ ] `lib/auth/workspace-access.ts`: `evaluateAccess(sub, email)` (highest-rank role, area groups) and `applyAccess(staffId, result)` with the area replace-only-when-area-mappings-exist rule (BE §A.4)
- [ ] `GET /api/auth/google/start` (rate limit 20 / 10 min / IP from `X-Real-IP`) and `GET /api/auth/google/callback`: gate before `createSession()`, sub-first resolution order incl. `sub_mismatch` and `needs_link` (unique violation → `needs_link`, never 500), single transaction, `must_change_password = false` for Google staff, encrypted tokens stored with `google_sub`, `auth_events` allow/deny (BE §A.4)
- [ ] `getSessionAccess()` never returns `pending_first_access` for staff with `google_sub` (BE §A.4)
- [ ] `lib/auth/safe-return-to.ts` `safeReturnTo(value, fallback)` built on `APP_ORIGIN` (BE §A.10)
- [ ] `GET /api/auth/signout?next=` using `safeReturnTo(next, "/login")`, nested targets URL-encoded (review NB 3); accept or guard cross-site GET with `Sec-Fetch-Site` (review NB 4, decide and note in the PR)
- [ ] Group-mapping server actions in `lib/actions/workspace-access-actions.ts`: `list/create/update/deleteGroupMappingAction`, Administrador only, `groups.get` resolution, error codes per BE §A.7
- [ ] `GOOGLE_FAKE=1` fake implementation behind `lib/google/*` for tests; app refuses to start with `GOOGLE_FAKE=1` in production (BE §10)
- [ ] Tests: `evaluateAccess` units, token crypto round-trip, state/PKCE, `safeReturnTo` (`//x`, `/\x`, `https://x`), integration for sign-in link-by-email then by-sub, `needs_link` (BE §10, §A.11 #1–4, #10, #14, #17)

### Frontend
- [ ] Shared public-route module imported by both `middleware.ts` and `AppRouteGuard` (review FE note): `/login`, `/login/denegado`, `/change-password`, `/portal` + `/portal/*`
- [ ] `middleware.ts`: drop the `/login → /dashboard` cookie redirect; `/portal` paths outside the staff redirect (BE §A.5.1, §B.7)
- [ ] `AppRouteGuard`: new public paths; `/portal` paths render children without staff checks; guest on non-public paths → `window.location.assign("/api/auth/signout?next=%2Flogin")` (review NB 2, Recommended Edit). Server helpers go through sign-out only for `revoked` / `inactive`
- [ ] `/login` split into a server page (reads flags, redirects `active` sessions to `/dashboard`) + client form; **Entrar con Google** button; `?error=state|retry` `Alert` (FE §2.1)
- [ ] `/change-password` redirect rules per BE §A.5.1
- [ ] `/login/denegado` page with the 8 `motivo` messages, never reads the staff session (FE §2.2)
- [ ] `/configuracion/google` page shell (Administrador) with banner + **Grupos de Google** section: mappings table, **Agregar grupo** `Sheet`, edit/delete with `AlertDialog` (FE §2.5 section 2)
- [ ] Add shadcn `alert` and `breadcrumb` via the CLI (FE §6)
- [ ] Vitest: guard public paths, no loop for stale cookie, `/login` per flag combination, each `motivo` (FE §10, §11 #1–2)

### Infrastructure
- [ ] `AUTH_GOOGLE_ENABLED` (default `false`) and `AUTH_PASSWORD_ENABLED` (default `true`) flags read server-side (BE §A.8)
- [ ] New env vars in `.env.example`, `docker-compose.prod.yml`, `docs/google-drive.md`, and `kcd.yml` once PR #470 is merged (`TOKEN_ENCRYPTION_KEY` as `generate: hex32`) (BE §A.9)
- [ ] Workspace admin checklist (BE §A.9) handed to the client; staging OAuth client + service account + groups in place for manual verification
- [ ] Spec tidy: renumber BE §A.11 and §11 open questions; apply the review's Recommended Edits to `docs/specs/backend.md` (review NB 9, NB 1–3)

## Done Definition
- With `AUTH_GOOGLE_ENABLED=true`, a user in `cincel-arquitectos-senior` + `cincel-area-construccion` gets Arquitecto Senior + Construcción and sees all projects (§A.11 #1)
- A user in no role group, a personal Gmail, a suspended user each land on `/login/denegado` with the right message; no `core.sessions` row; `auth_events` row written (§A.11 #2, #3)
- An existing password staff row is linked by email on first Google sign-in, then by `sub` (§A.11 #10); `must_change_password` staff go straight to `/dashboard` (§A.11 #14)
- `return_to=//evil.example` and `https://evil.example` fall back safely (§A.11 #17)
- A stale cookie on `/dashboard` ends on `/login` with no loop; `/login/denegado` and `/portal/*` render without a staff session
- With both flags at defaults, password login and the existing Drive picker / Calendar behave exactly as before
- An admin can add, edit and delete group mappings; unknown group → "El grupo no existe"

## Parallel work
- BE: Directory / OAuth / crypto modules and the callback can run alongside FE: middleware + guard + public-route module + `/login/denegado`
- BE: group-mapping actions alongside FE: Configuración → Google groups section (contract in FE §5 `GroupMapping`)
- Infra: env/docs/kcd and the client's Workspace checklist run in parallel with all code

## Phase dependencies
- Requires: none (builds on existing `core.sessions`, roles and permissions)

## Complexity
- Backend: L
- Frontend: M
- Infra: S

## Risks
- Client's Workspace setup (custom admin role, groups, Internal OAuth client) is on the client's side and gates manual verification
- `kcd.yml` depends on unmerged PR #470
- Guard changes touch every page; a mistake causes redirect loops (cover with guard tests before merging)
