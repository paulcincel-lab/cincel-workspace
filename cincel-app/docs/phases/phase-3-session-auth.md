# Phase 3: Hand-Rolled Scrypt Session Auth

## Goal
Real login backed by Postgres, scrypt password hashing, httpOnly cookie sessions -- replacing the localStorage-only auth and retiring all Supabase auth code. Role/permission model unchanged.

## Deliverables

### Backend
- [ ] Populate `core.auth_credentials` table (schema defined in Phase 1): `team_member_id` FK, `password_hash` (scrypt), `salt`, `must_change_password`, `password_updated_at`, `last_login_at`, `auth_enabled`. Migrate the shape of today's `team_members.auth` jsonb into real columns.
- [ ] Populate `core.sessions` table (schema defined in Phase 1): `id` (random 32-byte token, stored hashed), `team_member_id`, `expires_at`, `created_at`, `user_agent`
- [ ] `lib/auth/password.ts` (new) -- `hashPassword` / `verifyPassword` using `crypto.scrypt` + `crypto.randomBytes` salt + `timingSafeEqual`. Replaces `simpleHash` in `lib/auth/auth-service.ts`
- [ ] `lib/auth/session.ts` (new) -- `createSession`, `getSession()` (reads cookie, joins sessions + team_members, returns same shape `resolveCurrentSessionAccess()` consumers expect), `destroySession`. Cookie: `httpOnly`, `secure`, `sameSite=lax`
- [ ] Rewrite `lib/auth/auth-service.ts` internals to use password.ts + session.ts. **Keep public API**: `loginWithEmailAndPassword`, `changeCurrentUserPassword`, `completeFirstAccessPasswordChange`, `resolveCurrentSessionAccess`, the `guest|inactive_member|no_system_access|pending_first_access|active` status union
- [ ] Delete `lib/auth/supabase-auth.ts`, `lib/supabase/*`, `@supabase/*` deps
- [ ] Update `middleware.ts` -- check session cookie presence for route protection (cheap check only; full validation in `getSession()` server-side). Keep public route list (`/login`, `/change-password`) and `AppRouteGuard.tsx` behavior
- [ ] Clean up `lib/data/team-public.ts` -- remove `auth` block entirely; revert temporary `role: "Administrador"` override on Paul. Seed one real admin credential in `scripts/seed.ts` (env-driven password, `must_change_password=true`)
- [ ] Delete `supabase/` directory (migrations, config.toml, tests) and `scripts/*supabase*`. Port `supabase/tests/rls_scoped_policies_test.sql` intent into `tests/unit/repository-authz.test.ts`

### Frontend
- [ ] No major frontend changes -- `app/login/page.tsx`, `app/change-password/page.tsx`, and guards keep working due to preserved public API
- [ ] Verify `AppRouteGuard.tsx` works with cookie-based session detection

### Infrastructure
- [ ] Remove `@supabase/*` packages from `package.json`
- [ ] Remove `NEXT_PUBLIC_SUPABASE_*` build args from `docker-compose.yml` and `.env.example`

## Done Definition
- Login with seeded admin credential succeeds
- Forced password change flow works on first login (`must_change_password=true`)
- Session persists across browser reload (httpOnly cookie)
- Logout clears cookie and redirects to login
- Protected routes redirect to `/login` when no valid session
- `npm run test:unit` green (including `tests/unit/auth-service.test.ts` with updated hashing/session mocks, `tests/unit/permissions.test.ts`, `tests/unit/repository-authz.test.ts`)
- No references to Supabase remain in codebase (no `lib/supabase/`, no `@supabase/*` in package.json)
- `lib/auth/permissions.ts` and `lib/auth/permissionsRegistry.ts` unchanged
- `CINCEL_ADMIN_EMAILS` escalation still works

## Parallel work
- BE: password.ts and session.ts can be built simultaneously
- BE: Supabase cleanup can start as soon as session.ts is integrated

## Phase dependencies
- Requires: Phase 2 (repositories use Drizzle, `getSession()` consumers exist in actions layer)

## Complexity
- Backend: L
- Frontend: S
- Infra: S

## Risks
- Session token storage and cookie configuration must be secure -- scrypt parameters, timing-safe comparison, httpOnly/secure flags are all critical
- Migration of existing `team_members.auth` jsonb data into `auth_credentials` rows must not lose any credentials
- Removing Supabase is irreversible -- ensure all RLS policy intent is captured in `repository-authz.test.ts` before deletion
