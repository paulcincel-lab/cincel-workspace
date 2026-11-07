# Redesign Phase 8: Acceso y portal

## Goal
Sign-in, access denied, password change and the first-login wizards use the new split layout and tokens, and the client portal follows the organization theme with its project page in three styles.

## Deliverables

### Backend
- [ ] None (existing auth, wizard and portal logic unchanged)

### Frontend
- [ ] `/login` split layout (brand panel with CSS-shape pattern, form card), "Continuar con Google" primary with neutral "G" mark; `/login/denegado` with the email, "Usar otra cuenta", "Contactar al administrador" (`mailto:` from General settings `contactEmail`) (FE §3.10)
- [ ] `/change-password` restyled on the same layout (FE §3.10)
- [ ] First-login wizards `/ajustes/google/primeros-pasos` and the monday wizard: existing steps, restyled stepper (FE §3.10)
- [ ] `PortalLogin` and portal 404 restyled with the organization theme (no client override) (FE §3.11)
- [ ] Portal project page in three styles: `PhaseStepper`, `ProgressListWidget`, `AgendaWidget`, `RecordTable`; `EstiloSwitch scope="portal"` in the portal top bar, style read from the `cincel-portal-style` cookie in the portal layout; approvals / messages sections only where portal data exists (FE §3.11)
- [ ] Vitest + a11y for each restyled page; portal style cookie round trip (FE §17)
- [ ] Playwright: existing login and portal specs updated; run locally, result on the issue

### Infrastructure
- [ ] None

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- `Login`, `LoginDenegado`, `CambioContrasena`
- `BienvenidaGoogle`, `BienvenidaMonday` (wizard steppers)
- `PortalLogin`, `PortalProyecto`, `PortalProyectoEsencial`, `PortalProyectoAnalitico`, `Portal404`
- `LoginJornada` belongs to Phase 6 (clock-in prompt)
- Not implemented: `InicioCutto`, `CuttoLlamada`; portal approvals / messages blocks without existing data

## Done Definition
- The portal project page renders Visual, Esencial and Analítico from the same data, the switch is keyboard-operable and the choice survives reload via `cincel-portal-style` (FE §18 item 4)
- No page here writes per-style markup (guard test); forms (login, password, wizards) ignore the style (FE §15.3, §18 item 15)
- Sign-in, Google sign-in, denied, password change and both wizards behave exactly as before (existing e2e green)
- The portal uses the organization theme; a portal user can't change it
- Auth pages follow the redesign look only for flag-on staff (or the org default); with `redesignAvailable` false they render as today (FE §18 item 17)
- Axe clean on every restyled page in all three themes, light and dark (FE §18 item 13); 390 px without horizontal scroll (FE §18 item 14)
- Playwright run recorded; Vitest green in the existing CI

## Parallel work
- FE: auth pages ∥ wizards ∥ portal login / 404 ∥ portal project page
- Runs alongside Phases 2–7 (Rule 2)

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: S
- Frontend: M
- Infra: S

## Risks
- Login runs before any session exists, so the per-user flag is unknown; the page renders by the org setting (`redesignDefault`) until Phase 9 removes the flag. Confirm on the issue
- The Google and monday wizard files are near the Ajustes pages restyled in Phase 6; this phase owns only the stepper / wizard components
- Portal users have no `user_preferences` row; the portal cookie is the only style store
