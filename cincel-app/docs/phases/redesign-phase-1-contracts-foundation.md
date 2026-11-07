# Redesign Phase 1: Contracts and Foundation

## Goal
Every contract and shared building block of the redesign exists and is merged: one migration with all new tables, the types and the 62 action signatures (stubs with flags modules), the flag-gated appearance pipeline, the new shell, the whole style-aware widget library and shared patterns, `notify` + cron, the email templates, the assistant tool scaffolding and the server guards, so Phases 2–8 can start in parallel the day it closes. With the flag off nothing changes for anyone.

## Deliverables

### Backend
- [ ] Drizzle schema files `lib/db/schema/{preferences,notifications,my-space,gmail,time,vacations,assistant}.ts`, enum additions in `_schema.ts`, `cron_runs` + `cron_leases` in `shared.ts`, `staff_profiles.vacation_days` (BE §3.2–§3.13)
- [ ] ONE migration `<generated>_redesign_contracts.sql`, generated with `drizzle-kit generate` against current `main` right before merge (never renumbered; regenerated if Project Flow merged first); appended seeds `appearance.theme` (Azul, `redesignDefault = false`, `redesignAvailable = true`, `v = 1`), `time_tracking`, `vacations` when missing; `appearance.primary_color` untouched (BE §4, §5.4)
- [ ] `lib/types/redesign.ts`, `lib/types/widgets.ts` (single source of the widget shapes), `lib/validation/redesign.ts` (BE §6, §6.1; FE §4.10.1, §7.1)
- [ ] `lib/ui/themes.ts` `THEME_PRESETS` with the token values of BE §5.1–§5.4 (one module for both sides)
- [ ] All 62 action signatures of BE §7 as stubs (Rule 1: reads return safe defaults, writes throw `NOT_IMPLEMENTED`), each actions file with its sibling plain flags module `lib/actions/<domain>-actions.flags.ts` (`IMPLEMENTED`), incl. `dashboard-actions.flags.ts` and `projects-actions.flags.ts`; Vitest flags check (one key per exported action, no extra keys, `"use server"` files export only async functions) (BE §7, §9.10, §16 Flags; review B20)
- [ ] Module skeleton: every new file of BE §15 / FE §12 that Phase 1 or a registry owns is created with its exported signature and a safe default (registries `lib/shell/nav-items/<domain>.ts`, `lib/shell/sidebar-slots/<name>.tsx`, `lib/shell/settings-sections/<page>/<name>.tsx`, `lib/assistant/tools/<domain>.ts`, `lib/cron/jobs/<name>.ts` for the five canonical jobs, `lib/cron/daily-producers/{index,vencimiento}.ts`), plus the flag-aware redirect helper `lib/ui/redesign-redirect.ts` (no-op stub; new-only pages of Phases 3–6 call it first, Phase 2 implements it) and null stubs for `AssistantButton` / `CommandPalette` / `BottomTabs` that `AppShell` mounts (FE §21.1; Rule 1)
- [ ] `fetchMyPreferencesAction` / `updateMyPreferencesAction` fully implemented (`INVALID`, `OVERRIDE_DISABLED`, `DISABLED` when `redesignAvailable` is false; writes the `cincel-appearance` cookie); `fetchOrgAppearanceAction` implemented as a reader in `org-appearance-actions.ts` (save/reset stay stubs for Phase 6) (BE §7.1, §8.1, §8.2)
- [ ] `lib/ui/preferences.ts` `resolveAppearance`, `lib/ui/appearance-css.ts` `toCssVars` (light + dark, type scale, shape, `--text-base`), cookie read/validate with version `v` (BE §8.1, §8.2)
- [ ] `lib/ui/contrast.ts` (`CONTRAST_PAIRS`, `checkContrast`, rgba compositing), `lib/ui/tints.ts`, `scripts/themes-css.ts` + `npm run themes:css` (not run until Phase 9) (BE §5.5, §8.2; FE §14.5, §14.6)
- [ ] `general_settings.company` fields `instagramUrl`, `contactEmail` + defaults in `lib/settings/general-settings-schema.ts` (BE §21, review B19a)
- [ ] Photo routes `POST /api/staff/me/photo` (2 MB, EXIF/XMP stripped, `TOO_LARGE`, `INVALID_TYPE`, `RATE_LIMITED`), `GET /api/staff/[id]/photo` (ETag, 304, 404) and `removeMyPhotoAction` fully implemented (BE §7.2, §8.11)
- [ ] `lib/errors.ts` `actionErrorText(err, context?)` with every code of FE §9 incl. `NOT_IMPLEMENTED` (reuses Project Flow's file if it landed first, same signature) (BE §9.10, FE §9)
- [ ] Capabilities in `lib/auth/permissions.ts`: `canManageAppearance`, `canManageGeneralSettings`, `canManageTimeTracking`, `canViewTeamHours`, `canDecideVacations`, `canSeeAdminData` re-export (BE §12.1)
- [ ] `lib/tramos/compat.ts`: `listTramos`, `tramoLabel`, `tramoColorSlot`, `tramoColorVar`, `phaseLabel`, `canSeeAdminData` (Project Flow when present, else `workflows` rows / `isAdministratorRole`) (BE §9.7, FE §21.2)
- [ ] `lib/repositories/owner-scoped.ts` with one shared owner test suite (BE §8.0.3)
- [ ] Read helpers fully implemented: `lib/time-tracking/week-hours.ts`, `lib/vacations/approved-absences.ts`, `lib/my-space/reminders-for-day.ts` (BE §8.12)
- [ ] Metrics helper `lib/metrics/series.ts` and widget builders `lib/metrics/widgets.ts` (consumed by Phases 3, 4, 6, 7; not named in §21 but required by Rule 2 so no page phase waits on another) (BE §8.0.1, §8.0.2)
- [ ] `lib/notifications/notify.ts` full (row insert, preferences, quiet hours, `email_status = 'pending'`, dedupe, actor exclusion) and `lib/notifications/digest.ts` (BE §8.3, §9.3)
- [ ] Cron: `lib/cron/{registry,tick,lease}.ts`, `/api/cron/tick` (constant-time Bearer check, 401/503/204/200), jobs `notifications-deliver` and `daily-digest` (producers registry run, digests, housekeeping); stub job files `reminders-fire`, `gmail-sync`, `auto-close-jornadas` that run nothing; stub `vencimiento.ts` producing nothing (BE §8.0.4, §13)
- [ ] ALL new email templates: `recordatorio`, `resumen-diario`, `vacaciones-decision`, `vacaciones-solicitud` (Spanish copy, `layout.ts`) (BE §11.3)
- [ ] Assistant scaffolding: `lib/assistant/define-tool.ts` (`defineTool` with `capability`, `confirm` → `needsApproval`, `available(ctx)` importing flags modules, `summarize(input)`), registry + `lib/assistant/tools/index.ts` auto-collect, client-safe `lib/assistant/tool-summaries.ts`; chat route untouched (BE §10.1; Rule 3)
- [ ] `lib/integrations/cutto-links.ts` (client-safe deep links) and `CuttoClient` interface with a no-op implementation in `cutto-api.server.ts` (absent tools without `CUTTO_API_URL`) (BE §11.2, FE §4.9)

### Frontend
- [ ] Every staff page moved once into `app/(staff)/`; `app/(staff)/layout.tsx` renders `AppShell` when the flag is on and `children` bare when off; `LegacyFrame` for restyled pages' flag-off branch; never two sidebars (FE §2.3, §5)
- [ ] `app/layout.tsx`: flag-off renders exactly today's pipeline (`primary-color` block, `globals.css`, `ThemeToggle`); flag-on renders `<html>` attributes, `<style id="appearance">` with `html:root[data-theme=…]` sections, system-mode head script, `.dark` in sync; fonts Geist / Inter / DM Sans via `next/font`; `lang="es"`; exactly one Sonner `<Toaster position="bottom-right" offset={72} />` for both shells (FE §3.1, §4.1, §14.1; reviews B17, B18)
- [ ] `AppearanceProvider` + `useAppearance` (attributes and style-block swap only, optimistic with rollback and toast, 300 ms debounce on text size) (FE §4.1)
- [ ] `AppShell`, `Sidebar` (logo, nav items with badges from the nav model, Tramos list from `listTramos`, Ajustes, user block; search button hidden while `IMPLEMENTED.searchWorkspaceAction` is false; TimeClock slot hidden while `IMPLEMENTED.clockInAction` is false / `fetchMyTodayAction` reports `enabled: false`), `lib/ui/nav.ts` `buildNavModel` collecting `lib/shell/nav-items/*` (FE §3.1, §4.1, §21.1)
- [ ] `PageHeader` edited in place in `components/v2/layout/PageHeader.tsx` (breadcrumb, badge, 22 px title), re-exported from `components/shell` (FE §4.2)
- [ ] `EstiloSwitch` (radiogroup, keyboard, disabled with `OVERRIDE_DISABLED` copy, `scope="staff" | "portal"`, `?estilo=` override), `StyleProvider` / `useStyle`, `StyleView` in `components/widgets/` (FE §4.2, §15.1)
- [ ] `EmptyState`, `ErrorState`, `LoadingSkeleton` (variants `kpis`, `cards`, `list`, `table`, `board`, `calendar`) (FE §4.2)
- [ ] Widget library `components/widgets/*`, one fixture per widget and style: `WidgetCard`, `KpiWidget`, `DistributionWidget`, `ProgressListWidget`, `AttentionListWidget`, `AgendaWidget`, `PeopleWidget`, `RecordTable`, `EntityCardGrid`, `TaskBoardWidget`, `CronogramaWidget`, `StatusChip`, `TramoBadge` — each evolving the existing component named in the reuse column (FE §4.10, §4.11.1, §15)
- [ ] Shared patterns `components/patterns/*`: `FormSheet`, `FormDialog` (`dismissible`), `SettingsSection` / `SettingsRow`, `ListPage` (one widget per `spec.kind`), `FiltersBar` (FE §4.11)
- [ ] `/ajustes` layout with `AjustesNav` (items rendered only with their segment capability; Tramos / Puestos only when Project Flow pages exist) and one `app/(staff)/ajustes/(admin)/<segment>/layout.tsx` per segment calling `requirePageCapability(cap)` → `notFound()`; `AppRouteGuard` prefix check kept only for legacy `/configuracion` (FE §3.8, §8; BE §12.2; not named in §21, shared by Phases 5 and 6)
- [ ] `ConfirmationCard` (`render_confirmation`, summary from `tool-summaries.ts`), `AssistantTableMessage` (`render_table` → `RecordTable`), `AssistantTimelineMessage` (`render_timeline` → `AgendaWidget`); UI only, chat route untouched (FE §3.9, §4.9)
- [ ] Vitest: widget per-style tests + empty + a11y; guard test (no `StyleView` import or style branching outside `components/widgets/*`, allowlist EstiloSwitch / StyleProvider); root layout flag-off / flag-on tests; stub-phase test (no entry point that would call a write stub is rendered, one per domain) (FE §17)

### Infrastructure
- [ ] `CRON_SECRET` in the production env; host cron line `* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/tick` on the Docker network; documented in `docs/deployment.md` (BE §13, §14)
- [ ] `NEXT_PUBLIC_CUTTO_BASE_URL` default documented; `package.json` script `themes:css` (BE §14, §15)
- [ ] Local B18 Playwright dark-scheme run recorded on the appearance issue (BE §16)

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- `Sidebar.dc.html` — shell, nav items, Tramos list, user block (clock and search slots hidden in this phase)
- `Estilos.dc.html` — the Visual / Esencial / Analítico matrix every widget implements (FE §15.3)
- `EstadosSistema.dc.html` — empty, skeleton, inline error with retry, toasts (component level; route wiring is Phase 2)
- `AsistenteWidgets.dc.html` — `render_table`, `render_timeline`, confirmation card
- Component `AjustesNav` (as drawn inside the `Ajustes*` frames)
- Widgets are checked against their instances in `Dashboard`, `InicioEsencial`, `InicioAnalitico`, `Tareas`, `TareasEsencial`, `TareasAnalitico`, `Proyectos`, `ProyectosEsencial`, `ProyectosAnalitico`, `Personas` (+ `PersonasEsencial`, `PersonasAnalitico`) using fixtures, not pages
- Not implemented: `InicioCutto`, `CuttoLlamada` and the sidebar open-mic dock (Cutto's own build, brief decision 13)

## Done Definition
- The migration applies on an empty DB and on a fixture with `appearance.primary_color` set; both seed `baseTheme = 'azul'` and leave `primary_color` unchanged; all §16 constraint db tests pass (BE §16)
- With every user's flag off (the default), every existing page renders exactly as today: same colors, `primary-color` block, `ThemeToggle`, old sidebar and header; no `<style id="appearance">`, no appearance attributes, no head script (FE §18 items 2 and 17; BE §17 item 1)
- With a user's flag on, `/proyectos` and `/asistente` render inside `AppShell` with one sidebar and one header; no nav item, palette command, sidebar slot or button that would call a write stub is rendered (stub-phase test per domain) (FE §17)
- `updateMyPreferencesAction` persists theme / mode / style / density / text size, rewrites the cookie, and throws `OVERRIDE_DISABLED` with overrides off and `DISABLED` with `redesignAvailable = false` (BE §17 item 1)
- Every preset passes every `CONTRAST_PAIRS` entry in all six theme × mode combos and matches the BE §5.5 ratios (±0.01) (BE §17 item 2)
- Three-style rule: each widget renders the same fixture data in Visual, Esencial and Analítico (same numbers), renders only the chosen style, and has an empty-state and an axe test with no serious/critical violations in all three themes, light and dark (FE §16, §18 items 4 and 13)
- Guard test green: no file outside `components/widgets/*` imports `StyleView` or branches on the presentation style (allowlist EstiloSwitch / StyleProvider); `ListPage` passes data + a widget spec only (FE §18 item 15)
- Flags check green: every exported action has an `IMPLEMENTED` key, no extra keys, `"use server"` files export only async functions (BE §16 Flags)
- `/api/cron/tick`: 401 wrong secret, 503 without `CRON_SECRET`, 204 when the lease is held, 200 with the job report; a crashed tick's lease is taken after expiry; `daily-digest` runs once per window (BE §17 item 12)
- `notify` stores one row per recipient with the right delivery state for every channel combination and never notifies the actor (BE §17 item 5)
- A non-admin gets 404 on `/ajustes/permisos`, `/ajustes/general`, `/ajustes/estatus` (server segment guards) and `AjustesNav` omits exactly those items (FE §18 item 18; BE §17 item 14)
- Photo route returns 401 / 413 / 415 / 429 per case and strips GPS EXIF from jpeg/png/webp fixtures
- Local B18 Playwright run (dark scheme emulated: light, dark, system, flag-off) recorded on the issue; typecheck, lint and all Vitest suites pass in the existing CI

## Parallel work
Phase 1 is nine workstreams. The only merge-order dependency is the **contract tier**: the migration PR (W1) and the contract skeleton PR (W2: types, zod, presets, action stubs + flags, module/registry stubs). Every other Phase 1 PR codes against those contracts (stubbing them locally until they merge) and is mergeable on its own; no other Phase 1 PR waits for another.
- **W1 Data / migration:** schema + single migration + seeds ∥ owner-scoped helper ∥ read helpers ∥ photo routes
- **W2 Types, stubs and flags:** contract skeleton ∥ general settings link fields ∥ `actionErrorText` codes
- **W3 Appearance pipeline:** contrast + tints + `themes:css` ∥ resolver + CSS + cookie + preferences actions ∥ root layout SSR + `AppearanceProvider` + fonts + Toaster (codes against the skeleton's `resolveAppearance`, which returns flag-off until the resolver lands)
- **W4 Shell components:** `(staff)` move + `LegacyFrame` ∥ `AppShell` / `Sidebar` / nav model ∥ `PageHeader` + `EstiloSwitch` + `StyleProvider` + guard test ∥ Empty / Error / Loading states
- **W5 Widget library:** one PR per widget (13) ∥ metrics helper + widget builders (BE)
- **W6 Shared patterns:** `FormSheet` ∥ `FormDialog` ∥ `SettingsSection` / `SettingsRow` ∥ `ListPage` ∥ `FiltersBar`
- **W7 Notify, cron, templates:** cron registry + lease + tick route ∥ `notify` ∥ `notifications-deliver` + `daily-digest` jobs ∥ email templates ∥ INFRA cron line
- **W8 Assistant UI scaffolding:** `defineTool` + registry + summaries ∥ `ConfirmationCard` ∥ `render_table` / `render_timeline` adapters ∥ Cutto links + no-op client
- **W9 Permissions, guards, compat:** capabilities ∥ segment guards + `AjustesNav` ∥ `lib/tramos/compat.ts`
- BE and FE run side by side in every workstream; FE widgets use fixtures typed by `lib/types/widgets.ts`, never live actions

## Phase dependencies
- Requires: none (Phases 16–18, Staff SSO, Client Portal, Cronograma and monday migration are merged; Project Flow may land before or after, see Risks)
- Unblocks: Phases 2, 3, 4, 5, 6, 7 and 8 (all at once)

## Complexity
- Backend: XL
- Frontend: XL
- Infra: S

## Risks
- Largest phase by design (44 issues). Keep the two contract PRs small enough to land in the first days; review the skeleton's signatures against the FE §7 / BE §7 tables, since every later phase builds on them
- Migration ordering with Project Flow: whichever merges second deletes and regenerates its migration on top (BE §4); check on the merge PR
- `app/(staff)` move touches every staff page; Project Flow Phase 2 also edits Actividades / Proyectos pages. Land the move as one mechanical commit and rebase quickly
- One `Toaster` only: if Project Flow Phase 2 merged first, reuse its Toaster instead of adding a second (BE §21.1)
- `app/layout.tsx` is edited by the W3 root-layout PR only; any other PR that needs it rebases
- The widget stubs in the skeleton are placeholders; widget PRs that merge before `RecordTable` render their Analítico tables through the stub `RecordTable` and keep passing when it lands (tests assert data, not markup details)
- CI workflow `cincel-app-build.yml` breaks the standing rules (ubuntu-latest, no timeout, Playwright job, buildx); out of scope here, tracked as its own infra issue (review NB 26)
