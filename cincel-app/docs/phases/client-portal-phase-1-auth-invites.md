# Client Portal Phase 1: Portal Sign-in + Invitations

## Goal
Staff invite a project's client from a new Clientes tab, the client gets an email, signs in with a 6-digit code on their phone and sees a read-only list of their projects with summary and cronograma (no files yet).

## Deliverables

### Backend
- [ ] `lib/db/schema/portal.ts` + migration: `portal_users`, `portal_sessions`, `portal_login_codes`, `project_portal_access`, `portal_file_events`, `portal_audit_events`, enums (BE §B.3). Add `...stamps` (or an `updated_at`) to `project_portal_access` and `portal_login_codes` (review NB 10)
- [ ] `lib/email/index.ts` `sendMail` over SMTP (`nodemailer`), log-only without `SMTP_HOST`; templates Invitación, Código, Archivo recibido (BE §B.6). Decide whether the invite link keeps `?email=` in the query string (review NB 10) and note it in the PR
- [ ] Permissions module **Portal de clientes** in `permissionsRegistry` + capability type, resolver and per-role defaults in `lib/auth/permissions.ts`: `portal.manageAccess`, `portal.disableUsers` (BE §B.5, §0.3, review NB 7)
- [ ] `lib/portal/session.ts`: `cincel_portal_session` cookie, `requirePortalUser()` (30-day sliding, page → `/api/portal/auth/logout?next=…`, API → 401 `{ redirect }`), `requireProjectAccess(pid)` (404, `cancelado`/deleted hidden) (BE §B.2, §B.4.3)
- [ ] `POST /api/portal/auth/code` (5/h/email, 20/h/IP, same response and work for unknown emails, `after()` send), `POST /api/portal/auth/verify` (10/15 min/IP, 3 attempts, `timingSafeEqual`, `invited → active`), `POST` + `GET /api/portal/auth/logout` (BE §B.4.2); opportunistic cleanup of expired rows (BE §B.3)
- [ ] `lib/actions/portal-actions.ts`: `invitePortalClientAction`, `resendPortalInviteAction` (3/h), `revokePortalAccessAction`, `disablePortalUserAction`, `enablePortalUserAction`, `listProjectPortalAccessAction`, `listProjectPortalActivityAction`, `portal_audit_events` (BE §B.4.1, §B.4.8)
- [ ] `lib/portal/queries.ts` + `lib/types/portal.ts`: `listPortalProjects`, `getPortalProject`, `getPortalSchedule` → `PortalProjectDTO` / `PortalScheduleDTO` (per-`seccion` only, no `tarea`/`responsable`) (BE §B.4.3, §0.3)
- [ ] ESLint `no-restricted-imports` for `app/portal/**`, `app/api/portal/**`, **`components/portal/**` and `lib/portal/**`** blocking `@/lib/actions/*`, `@/lib/repositories/*`, `@/lib/auth/session` (BE §B.7, review NB 8)
- [ ] Tests: code generation/attempts/rate limits, session sliding, staff/portal cookie isolation, invite/revoke/disable, DTO mappers contain no forbidden fields, permission defaults (BE §10, §B.8 #1, #2, #8–11)

### Frontend
- [ ] Portal shell `app/portal/layout.tsx` (`PortalShell`: logo, client name, **Salir**; `max-w-3xl`), `not-found.tsx`, `error.tsx` in Spanish (FE §3, §3.4)
- [ ] `/portal/login` with `OtpForm` (email step, `InputOTP` step, 60 s resend countdown, error copy, `aria-live`) (FE §3.1)
- [ ] `/portal` project cards (`PortalProjectCard`) and empty state (FE §3.2)
- [ ] `/portal/proyectos/[id]` `Tabs` with **Resumen** and **Cronograma** (`PortalSchedule` grouped by `planta`) (FE §3.3)
- [ ] `/proyectos/[id]/clientes` + `PortalAccessPanel` + `InvitePortalClientSheet` (contact `Combobox`, `socio` confirmation, error-code copy, inline success, row actions with `AlertDialog`, **Habilitar**/**Deshabilitar**, Actividad card); show **Clientes** in `ProjectSectionNav` with the same capability the server checks (FE §2.4)
- [ ] Add shadcn `command` and `input-otp` via the CLI (FE §6)
- [ ] Vitest: OTP steps/errors, invite sheet `socio` confirmation (FE §10)

### Infrastructure
- [ ] `mailpit` service in local `docker-compose.yml`; SMTP vars in `.env.example`, `docker-compose.prod.yml`, `kcd.yml` (`SMTP_PASSWORD` secret) (BE §B.6, §A.9)
- [ ] `middleware.ts`: `/portal/*` (except `/portal/login`) without the portal cookie → `/portal/login` (BE §B.7)

## Done Definition
- A user with `portal.manageAccess` invites a `cliente` contact of Project A; the email arrives (Mailpit locally), the client signs in with a code and sees only Project A (§B.8 #1)
- A never-invited email gets the same "send code" response and receives nothing (§B.8 #2)
- Fourth wrong code or expired code fails; sixth send in an hour → 429 (§B.8 #11)
- **Quitar acceso** removes the project on the next request; **Deshabilitar** signs the client out everywhere (§B.8 #8)
- Portal cookie on a staff page is no session, and vice versa (§B.8 #9)
- Portal JSON / DTOs contain no `tarea`, `responsable` or staff names other than the manager (§B.8 #10)
- The portal is usable at 360 px for login, project list and tabs

## Parallel work
- BE: schema + email + portal auth routes alongside FE: portal shell + `OtpForm` (contract FE §7.2)
- BE: portal actions alongside FE: Clientes page + invite sheet (contract FE §5, §7.1)
- Can start as soon as Staff SSO Phase 1 is merged, in parallel with Staff SSO Phases 2 and 3

## Phase dependencies
- Requires: Staff SSO Phase 1 (public `/portal` paths in middleware + `AppRouteGuard`, `safeReturnTo`, `X-Real-IP` handling)
- Clientes tab plugs into `ProjectSectionNav` from Staff SSO Phase 3; if Phase 3 isn't merged yet, the Clientes page ships without the shared nav and is linked once it lands

## Complexity
- Backend: L
- Frontend: M
- Infra: S

## Risks
- SMTP provider for production not chosen yet; invites fall back to "Reenviar invitación" until it is
- Defaults in BE §0.3 (permissions, cronograma detail) still need client confirmation
