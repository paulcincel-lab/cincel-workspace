# Staff SSO Phase 2: Access Re-check + Cutover

## Goal
Access is re-checked against Workspace every 4 hours (and on demand), Google-managed staff have read-only role/areas, admins see Google health and cutover progress, and password login can be switched off safely.

## Deliverables

### Backend
- [ ] Re-check in the session helpers (`getSessionAccess`, `requireSession`, `requireSessionAccess`, `requireCapabilityUser`): claim via conditional `update … returning`, Directory call only for the claimer, revoke → delete sessions + `auth_events` + redirect through `/api/auth/signout?next=%2Flogin%2Fdenegado%3Fmotivo%3Drevoked`; Directory error → keep access, back off 5 min persisted in `access_checked_at` (BE §A.5)
- [ ] `access_revoked_at` or `active = false` → sign out on next request; route handlers keep turning the thrown redirect into their 401 (review backend note)
- [ ] `recheckStaffAccessAction(staffId)` ignoring the interval (BE §A.7)
- [ ] `getGoogleHealthAction()` → `GoogleHealth` (BE §A.7, FE §5)
- [ ] Staff list DTO gains `googleManaged`, `lastLoginAt`, `accessRevokedAt`, `accessRevokedReason`; `staff-actions` and `areas-actions` refuse role / area changes for Google-managed staff ("Se administra en Google Workspace") (BE §A.7, §A.11 #12)
- [ ] `AUTH_PASSWORD_ENABLED=false`: `loginAction`, first access and change password return 404 / refuse (BE §A.8 step 3, §A.11 #11)
- [ ] `scripts/disable-passwords.ts`: `auth_credentials.enabled = false` and `must_change_password = false` for staff with `google_sub` (BE §A.8)
- [ ] Integration tests: re-check revoke deletes sessions, Directory outage signs nobody out, one claimer only (BE §10, §A.11 #5–7)

### Frontend
- [ ] Configuración → Google **Estado** section: service account, Shared Drive ID, key configured, last Directory / Drive error, "N de M colaboradores activos ya entraron con Google" (FE §2.5 section 1)
- [ ] Equipo / Áreas: read-only role and area fields with `Badge` "Google Workspace" + tooltip for `googleManaged`; **Revisar acceso ahora** (Administrador) with inline result; "Último acceso" column and "Sin acceso" badge (FE §2.6)
- [ ] Vitest: read-only fields for Google-managed staff (FE §10, §11 #7)

### Infrastructure
- [ ] `ACCESS_RECHECK_HOURS` documented and wired (BE §A.9)
- [ ] Cutover runbook in `docs/google-drive.md`: steps 1–4 of BE §A.8 incl. break-glass

## Done Definition
- Removed from all role groups (or suspended) → first request after 4 h signs out, sessions deleted, lands on `/login/denegado?motivo=revoked`; **Volver a intentar** shows `/login` without a loop (§A.11 #5, #6, #13)
- **Revisar acceso ahora** revokes at once
- A Directory outage at re-check signs nobody out and retries ~5 min later
- Role/area edits for a Google-managed staff member are refused by the server actions, not just hidden
- With `AUTH_PASSWORD_ENABLED=false` the password form is hidden and `loginAction` refuses; `disable-passwords.ts` runs idempotently

## Parallel work
- Can run in parallel with Staff SSO Phase 3 (different modules: session helpers / Equipo vs Drive)
- BE: re-check + actions alongside FE: Equipo/Áreas read-only UI and Estado section

## Phase dependencies
- Requires: Staff SSO Phase 1 (schema, directory client, `evaluateAccess`/`applyAccess`, sign-out route, Configuración → Google page)

## Complexity
- Backend: M
- Frontend: S
- Infra: S

## Risks
- Re-check runs inside every session helper; latency or an exception there affects every page (keep the Directory call to the single claimer, with timeouts)
- Turning passwords off in production must wait until "N de M" reaches everyone active
