# Redesign: issue plan

**Status:** Created on GitHub (2026-11-07), milestones #52–#60 · **Date:** 2026-11-07
**Phases:** `docs/phases/redesign-phase-{1..9}-*.md` (single source for scope: backend §21)
**Specs:** `docs/specs/redesign/frontend.md` (FE), `docs/specs/redesign/backend.md` (BE), brief `docs/specs/source/redesign-spec.md`
**Canvas:** https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

Issue IDs (`R<phase>-<nn>`) are the plan IDs; the GitHub issue number is shown next to each one. Labels follow the repo convention: `type:task`, `agent:backend` / `agent:frontend` / `agent:devops`, and the phase label `redesign:<n>`; milestone = the phase title in `milestones.json`. Sizes: **S** = 1 day, **M** = 2 days, **L** = 3 days.

## Summary

| Phase | Issues | S | M | L | Total (days) |
|---|---|---|---|---|---|
| 1 Contracts and Foundation | 44 | 15 | 21 | 8 | 81 |
| 2 Shell, Navigation and States | 8 | 3 | 4 | 1 | 14 |
| 3 Inicio, Tareas y Calendario | 12 | 3 | 5 | 4 | 25 |
| 4 Proyectos, Personas, Biblioteca y Vacaciones | 15 | 1 | 10 | 4 | 33 |
| 5 Mi espacio, Bandeja y Gmail | 14 | 2 | 8 | 4 | 30 |
| 6 Ajustes, tema y Control de horario | 14 | 2 | 8 | 4 | 30 |
| 7 Asistente en todas partes | 13 | 1 | 9 | 3 | 28 |
| 8 Acceso y portal | 5 | 2 | 2 | 1 | 9 |
| 9 Cleanup | 5 | 3 | 1 | 1 | 8 |
| **Total** | **130** | **32** | **68** | **30** | **258** |

## Dependency rules for this plan

- **Contract tier (Phase 1 only):** `R1-01` (the single migration) and `R1-02` (contract skeleton: types, zod, presets, 62 action stubs + flags modules, module / registry / component stubs) are the only issues other issues build on. Every other Phase 1 issue codes against their contracts and may stub them locally until they merge; none waits for another non-contract issue.
- **Phases 2–8:** every issue depends only on Phase 1 being merged. No issue lists a "Blocked by" on another issue of Phases 2–8.
- **Phase 9:** blocked by Phases 1–8.
- Inside a phase, an FE issue that consumes an action of the same phase builds against the Phase 1 stub and its fixture data; it merges with the entry point hidden by the flags module and lights up when the BE issue flips the flag.

## How issues are written

Each issue body uses this template (same section order as existing issues, extended):

```markdown
## Context
One or two sentences: what the user gets and why.

## Scope
- Files and components created or changed (owned by this issue only)

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1
- `Frame` (+ `FrameEsencial`, `FrameAnalitico` where the issue owns a data view)

## Contract
- Implements: actions / routes / modules (with the flags entries it flips)
- Consumes: Phase 1 contracts (types, widgets, patterns, helpers) it relies on

## Acceptance criteria
- [ ] …

## Tests
- Vitest (unit / component / a11y / db) and, where listed, the local Playwright run recorded on the issue

## Out of scope
- What a reader might expect but belongs to another issue or phase

## Spec refs
docs/specs/redesign/frontend.md → §…; docs/specs/redesign/backend.md → §…

## Dependencies
Blocked by: none (Phase 1 contracts only) | R1-01 / R1-02 (contract tier) | Phases 1–8 (cleanup)
```

## Acceptance rules for every issue

Every issue's checklist implicitly includes these (reviewers check them on each PR):

1. **Flag behavior:** with `ui.redesign` off (or `redesignAvailable` false) the legacy page renders exactly as today; with it on the new UI renders in `AppShell`. Entry points stay hidden while their `IMPLEMENTED` flag (`lib/actions/<domain>-actions.flags.ts`) is false or their read action reports disabled / empty; nothing calls a write stub.
2. **Three styles via library widgets only:** data views render Visual / Esencial / Analítico only through `components/widgets/*` and `components/patterns/*`; no `StyleView` import or style branching outside `components/widgets/*` (guard test, FE §18 item 15). Forms, dialogs, settings, auth ignore the style.
3. **Reuse first:** components marked extends / replaces / evolves in FE §4.11.1 change the named existing component; no parallel copy (FE §18 item 16). Plain shadcn variants; color only from tokens, no color `className` overrides.
4. **Axe clean:** no serious or critical violations in all three themes, light and dark (`*-a11y.test.tsx`).
5. **Contrast via `lib/ui/contrast.ts`:** any color pair check uses `CONTRAST_PAIRS` / `checkContrast`; no ad-hoc ratio code.
6. **Spanish copy** from FE §9 (errors through `actionErrorText`) and FE §13 (labels), sentence case, es-MX dates in lowercase; no weight above 600.
7. **Visibility:** no admin task or client/origin data without `canSeeAdminData`; owner-only data filtered on the server.
8. **No AI or tool attribution text** anywhere in code, comments, commits, issue bodies or PR descriptions.
9. Vitest, typecheck and lint green in the existing CI; e2e runs are local (`CI=1 npm run test:e2e`) and recorded on the issue.

---

## Phase 1: Contracts and Foundation

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R1-01 (#855) | [BE]: Redesign schema and the single contracts migration with seeds | L | W1 Data / migration | — | none (contract) |
| R1-02 (#857) | [BE]: Contract skeleton: types, zod, theme presets, action stubs and flags modules | L | W2 Types / stubs / flags | — | none (contract) |
| R1-03 (#859) | [BE]: Owner-scoped CRUD helper with a shared owner test suite | S | W1 Data / migration | — | R1-01, R1-02 |
| R1-04 (#861) | [BE]: Read helpers weekHours, approvedAbsences and remindersForDay | M | W1 Data / migration | — | R1-01, R1-02 |
| R1-05 (#863) | [BE]: Profile photo upload / read routes and removeMyPhotoAction | M | W1 Data / migration | `Dashboard` (photo button target) | R1-01, R1-02 |
| R1-06 (#864) | [BE]: General settings company link fields and defaults | S | W2 Types / stubs / flags | `AjustesGeneral` | R1-02 |
| R1-07 (#866) | [BE]: actionErrorText and the redesign error codes | S | W2 Types / stubs / flags | `EstadosSistema` | R1-02 |
| R1-08 (#868) | [BE]: Contrast checker, tints and the themes:css script | M | W3 Appearance | — | R1-02 |
| R1-09 (#870) | [BE]: resolveAppearance, appearance CSS, cookie and preferences actions | L | W3 Appearance | `Ajustes` (behavior only) | R1-01, R1-02 |
| R1-10 (#872) | [FE]: Root layout appearance SSR, AppearanceProvider, fonts and Toaster | L | W3 Appearance | `InicioCalido`, `InicioGrafito`, `InicioOscuro` (theme check), `EstadosSistema` (toasts) | R1-02 |
| R1-11 (#873) | [FE]: Move staff pages into app/(staff) with a flag-aware layout and LegacyFrame | M | W4 Shell | — | R1-02 |
| R1-12 (#874) | [FE]: AppShell, Sidebar and nav model with nav-item and sidebar-slot registries | L | W4 Shell | `Sidebar` | R1-02 |
| R1-13 (#875) | [FE]: PageHeader v3, EstiloSwitch and StyleProvider with the style guard test | M | W4 Shell | `Estilos`, page headers in every screen frame | R1-02 |
| R1-14 (#876) | [FE]: EmptyState, ErrorState and LoadingSkeleton | S | W4 Shell | `EstadosSistema` | R1-02 |
| R1-15 (#877) | [BE]: Metrics helper and widget builders | M | W5 Widgets | — | R1-02 |
| R1-16 (#878) | [FE]: WidgetCard | S | W5 Widgets | `Estilos`, `Dashboard`, `InicioEsencial`, `InicioAnalitico` | R1-02 |
| R1-17 (#879) | [FE]: RecordTable | L | W5 Widgets | `Estilos`, `TareasLista`, `TareasListaAnalitico`, `InicioAnalitico` | R1-02 |
| R1-18 (#880) | [FE]: KpiWidget | M | W5 Widgets | `Estilos`, `Dashboard`, `InicioEsencial`, `InicioAnalitico` | R1-02 |
| R1-19 (#881) | [FE]: DistributionWidget | M | W5 Widgets | `Estilos`, `Dashboard`, `InicioEsencial`, `InicioAnalitico` | R1-02 |
| R1-20 (#882) | [FE]: ProgressListWidget | M | W5 Widgets | `Estilos`, `Dashboard`, `ProyectosAnalitico` | R1-02 |
| R1-21 (#883) | [FE]: AttentionListWidget | M | W5 Widgets | `Estilos`, `Dashboard`, `InicioEsencial`, `InicioAnalitico` | R1-02 |
| R1-22 (#884) | [FE]: AgendaWidget | L | W5 Widgets | `Estilos`, `Calendario`, `CalendarioSemana`, `CalendarioEsencial`, `CalendarioAnalitico` | R1-02 |
| R1-23 (#885) | [FE]: PeopleWidget | M | W5 Widgets | `Estilos`, `Personas`, `PersonasEsencial`, `PersonasAnalitico` | R1-02 |
| R1-24 (#886) | [FE]: EntityCardGrid | M | W5 Widgets | `Proyectos`, `ProyectosEsencial`, `Biblioteca` | R1-02 |
| R1-25 (#887) | [FE]: TaskBoardWidget | L | W5 Widgets | `Tareas`, `TareasEsencial`, `TareasAnalitico` | R1-02 |
| R1-26 (#888) | [FE]: CronogramaWidget | M | W5 Widgets | `ProyectoCronograma`, `ProyectoCronogramaEsencial`, `ProyectoCronogramaAnalitico` | R1-02 |
| R1-27 (#889) | [FE]: StatusChip and TramoBadge adapters | S | W5 Widgets | `Tareas`, `Estilos` | R1-02 |
| R1-28 (#890) | [FE]: FormSheet | M | W6 Patterns | `TareaDetalle`, `NotaEditor` (shell only) | R1-02 |
| R1-29 (#891) | [FE]: FormDialog | S | W6 Patterns | `NuevaTarea`, `NuevoRecordatorio` (shell only) | R1-02 |
| R1-30 (#892) | [FE]: SettingsSection and SettingsRow | S | W6 Patterns | `Ajustes`, `AjustesGeneral` (layout only) | R1-02 |
| R1-31 (#893) | [FE]: ListPage | M | W6 Patterns | `Proyectos`, `TareasLista` (layout only) | R1-02 |
| R1-32 (#894) | [FE]: FiltersBar | M | W6 Patterns | `Tareas` (filters row) | R1-02 |
| R1-33 (#895) | [BE]: Cron registry, lease and the /api/cron/tick route | M | W7 Notify / cron | — | R1-01, R1-02 |
| R1-34 (#896) | [BE]: notify() producer with preferences and quiet hours | M | W7 Notify / cron | — | R1-01, R1-02 |
| R1-35 (#897) | [BE]: Cron jobs notifications-deliver and daily-digest with the daily-producers registry | M | W7 Notify / cron | — | R1-01, R1-02 |
| R1-36 (#898) | [BE]: Email templates recordatorio, resumen-diario, vacaciones-decision, vacaciones-solicitud | S | W7 Notify / cron | — | R1-02 |
| R1-37 (#899) | [INFRA]: CRON_SECRET, host cron line and deployment docs | S | W7 Notify / cron | — | none |
| R1-38 (#900) | [BE]: defineTool, tool registry, tool summaries and tool domain stubs | M | W8 Assistant scaffolding | `AsistenteHerramientas` (catalog names) | R1-02 |
| R1-39 (#901) | [FE]: ConfirmationCard (render_confirmation) | S | W8 Assistant scaffolding | `AsistenteWidgets`, `Asistente` | R1-02 |
| R1-40 (#902) | [FE]: render_table and render_timeline adapters | S | W8 Assistant scaffolding | `AsistenteWidgets` | R1-02 |
| R1-41 (#903) | [BE]: Cutto deep links and the no-op CuttoClient | S | W8 Assistant scaffolding | — | R1-02 |
| R1-42 (#904) | [BE]: Redesign capabilities in lib/auth/permissions.ts | S | W9 Permissions / guards / compat | — | R1-02 |
| R1-43 (#905) | [FE]: Per-segment /ajustes server guards, Ajustes layout and AjustesNav | M | W9 Permissions / guards / compat | `AjustesNav` (component), `Ajustes` | R1-02 |
| R1-44 (#906) | [BE]: Project Flow compatibility module lib/tramos/compat.ts | S | W9 Permissions / guards / compat | `Sidebar` (Tramos list) | R1-02 |

**R1-01** Redesign schema and the single contracts migration
- Schema files of BE §3.3–§3.11, enums of §3.2 / §3.5, `cron_runs` / `cron_leases`, `staff_profiles.vacation_days`
- One migration generated with `drizzle-kit generate` against current `main` right before merge (regenerated, never renumbered, if Project Flow merged first)
- Seeds `appearance.theme` (Azul, `redesignDefault = false`), `time_tracking`, `vacations` only when missing; `appearance.primary_color` untouched
- db test: applies on an empty DB and on a fixture with `primary_color` set; every constraint of BE §16 (incl. one open time entry per staff under concurrency)

**R1-02** Contract skeleton
- `lib/types/redesign.ts`, `lib/types/widgets.ts`, `lib/validation/redesign.ts`, `lib/ui/themes.ts` `THEME_PRESETS` with the BE §5 values
- Every §7 actions file with its 62 signatures as stubs (reads safe defaults, writes `NOT_IMPLEMENTED`) and its sibling `*-actions.flags.ts`; `dashboard-` / `projects-actions.flags.ts`
- Every Phase 1 module, registry file (nav items, sidebar slots, settings sections, tool domains, the five cron job files, daily producers), `lib/ui/redesign-redirect.ts`, capability declarations and null component stubs (`AssistantButton`, `CommandPalette`, `BottomTabs`, widgets incl. a minimal `RecordTable`) exported with the spec signatures; `StyleProvider` / `useStyle` / `StyleView` minimal but real
- Flags check Vitest (one key per exported action, no extra keys, `"use server"` exports only async functions)
- Typecheck green; no UI change with the flag off

**R1-03** Owner-scoped helper
- `ownerScoped(table)` with `list`, `get`, `insert`, `update`, `softDelete`, `lockForUpdate` (BE §8.0.3)
- Another staff's row → `FORBIDDEN`, missing → `NOT_FOUND`; `staffId` always from the session argument
- One shared db suite parameterized over every table of BE §8.0.3

**R1-04** Read helpers
- `weekHours`, `approvedAbsences`, `remindersForDay` with the BE §8.12 signatures and §8.7 rules (lunch deduction)
- Return zeros / none / empty on empty tables
- db tests with fixture rows

**R1-05** Profile photo routes
- `POST /api/staff/me/photo`: 2 MB, jpeg/png/webp, EXIF/XMP stripped, 401 / 413 / 415 / 429, returns `{ url }`
- `GET /api/staff/[id]/photo`: ETag sha256, 304, 404, private cache
- `removeMyPhotoAction` revalidates the layout
- GPS-EXIF fixture tests for the three formats

**R1-06** General settings link fields
- `instagramUrl`, `contactEmail` + defaults in `general-settings-schema.ts`
- Old saved settings parse without loss (no strict-schema rollback failure)
- `app-settings-actions.ts` untouched (Phase 6)

**R1-07** actionErrorText
- `actionErrorText(err, context?)` accepts `Error`, `"CODE: detail"` and HTTP status; every FE §9 code incl. context variants and `NOT_IMPLEMENTED`
- Reuses Project Flow's file and signature if present
- Unit test per code

**R1-08** Contrast, tints, themes:css
- `CONTRAST_PAIRS`, `checkContrast(tokens, mode)` with rgba compositing; tint utilities (`color-mix` / oklab)
- Every preset passes every pair in six theme × mode combos and matches BE §5.5 (±0.01); `muted-foreground #c0c0c0` on white fails with the right pair
- `scripts/themes-css.ts` + `npm run themes:css` (not run on `globals.css` until Phase 9)
- `globals.css` drift snapshot test (unchanged from today)

**R1-09** Appearance resolver and preferences actions
- `resolveAppearance` per BE §8.1 (override on/off, preset vs org tokens, `redesignAvailable = false` forces off)
- `toCssVars` emits every `TokenName` for both modes plus type scale, shape, `--text-base`
- `fetchMyPreferencesAction` / `updateMyPreferencesAction` (`INVALID`, `OVERRIDE_DISABLED`, `DISABLED`), cookie written and ignored when `v` differs; `fetchOrgAppearanceAction` reader
- Flags entries flipped for these three actions

**R1-10** Root layout appearance
- Flag off: exactly today's pipeline, no appearance block, attributes or head script (B17 test)
- Flag on: `<html>` attributes, `data-theme` always set, `<style id="appearance">` with `html:root[data-theme=…]`, system-mode script ≤ 1 KB, `.dark` in sync, no token in a `style` attribute
- `AppearanceProvider` swaps attributes / style block optimistically with rollback toast; text size debounced 300 ms
- Fonts Geist / Inter / DM Sans, `lang="es"`, one `<Toaster position="bottom-right" offset={72} />` (reuse Project Flow's if it landed)
- Local B18 Playwright dark-scheme run recorded

**R1-11** app/(staff) move
- Every staff page moved once into `app/(staff)/` in one mechanical commit; URLs unchanged
- `(staff)/layout.tsx`: flag on → `AppShell`; off → children bare; no session → `/login`
- `LegacyFrame` mounts the old `Sidebar` + `Header`; test: never two sidebars
- Existing e2e green with the flag off

**R1-12** AppShell and Sidebar
- `AppShell` with `Sidebar` (logo, 7 items + badges, Tramos from `listTramos`, Ajustes, user block), replacing `components/layout/Sidebar.tsx` for flag-on only
- `buildNavModel` collects `lib/shell/nav-items/*`; items hide while their flags are false; Organización hidden for non-admins
- Search button and TimeClock slot hidden while their flags are false; active item tokens; lucide icons
- Vitest + a11y; stub-phase test per domain

**R1-13** PageHeader, EstiloSwitch, StyleProvider
- `PageHeader` edited in place (breadcrumb, badge, 22 px); its 8 importers unchanged
- `EstiloSwitch` radiogroup with arrow keys, disabled with `OVERRIDE_DISABLED` copy, `scope="portal"` writes the `cincel-portal-style` cookie
- `?estilo=` override read on the server, `isOverridden` true
- Guard test with the allowlist of FE §17

**R1-14** States
- `EmptyState`, `ErrorState` (default copy "No se pudo cargar esta página." + "Reintentar"), `LoadingSkeleton` six variants
- Built on shadcn `Alert`, `Skeleton`, `Button`; a11y tests

**R1-15** Metrics and widget builders
- `dailySeries`, `kpiFromDaily` (delta, `good` both directions, avg / min / max with < 30 points), `weeklyCounts` (extends `lib/dashboard/task-trend.ts`)
- `toDistribution`, `toProgressItems`, `toAttentionItems`, `toAgendaItems` (extends `donut-groups.ts`), pure and isomorphic
- Fixture tests type-checked against `lib/types/widgets.ts`

**R1-16 … R1-27** One issue per widget, same acceptance shape:
- Implements the FE §4.10.1 row for the widget, extending the existing component in its Reuse column (`KpiRow`/`KpiTile`, `chart.tsx`, `CapacityRing`/`LoadBar`, `UnifiedCalendar`, `DataTable` + `RowActionsMenu` / bulk select / `ExportMenu`, `TableroClient`, cronograma panels, `StatusBadge`, `AreaBadge` via compat)
- One test per style with the same fixture (same numbers in Visual / Esencial / Analítico), empty state, `LoadingSkeleton` variant, a11y in all themes and modes
- Fixture in `components/widgets/fixtures/`; data shape only from `lib/types/widgets.ts`; UI-only inputs are props
- Extra per widget: `RecordTable` grouping, `totals: "auto"`, heat thresholds (> 60 % / > 45 %), mono right alignment, `hideOn`; `KpiWidget` filters `visibleIn`; `TaskBoardWidget` keeps drag-and-drop with optimistic move + rollback and keyboard "Mover a…"; charts carry `role="img"` + `aria-label`

**R1-28 … R1-32** One issue per pattern:
- Contract exactly as FE §4.11 (`FormSheet` sticky footer + inline `Alert` + `actionErrorText`; `FormDialog` `dismissible`; `SettingsSection` / `SettingsRow` with `htmlFor`; `ListPage` renders one widget by `spec.kind` and never imports `StyleView`; `FiltersBar` chips with `aria-pressed` and URL hrefs)
- Extends the named existing component (`MemberEditorDrawer` / `ContactEditorSheet` / `TaskDrawer` footers; `NewTaskModal` / `ProjectCreateModal` shells; `TaskMemberProjectFilters`)
- Focus trap, Escape, focus return; a11y tests

**R1-33** Cron tick
- `registerJob`, `runTick` with the 55 s `tick` lease, sequential jobs within 50 s, per-job try/catch + `cron.job_failed` JSON log
- Route: constant-time Bearer, 401 / 503 / 204 / 200 report
- db tests: two concurrent ticks → one runs; expired lease taken; windowed job once per window

**R1-34** notify()
- Row per recipient with in-app / email / digest per preferences; quiet hours → `pending` with `deliver_after`
- Dedupe, actor exclusion, inactive staff skipped; `notify.failed` log
- db test per channel combination

**R1-35** Jobs notifications-deliver and daily-digest
- `notifications-deliver` sends due pending rows (limit 200) and sets `sent` / `failed`
- `daily-digest` 07:30 local: runs `daily-producers/index.ts` (stub `vencimiento` produces nothing), sends digests, housekeeping (180 days, 50 threads, 500 Gmail threads)
- Stub job files `reminders-fire`, `gmail-sync`, `auto-close-jornadas` registered and doing nothing; registry test: only the five canonical names

**R1-36** Email templates
- Four templates on `layout.ts`, Spanish copy per BE §11.3
- Snapshot test per template (SMTP log mode)

**R1-37** Cron infra
- `CRON_SECRET` in the production env; host cron line calling `http://app:3000/api/cron/tick` every minute on the Docker network
- `docs/deployment.md` updated; `NEXT_PUBLIC_CUTTO_BASE_URL` default documented
- After deploy: one tick response recorded on the issue

**R1-38** defineTool and registry
- `defineTool({ name, schema, capability, confirm, available, summarize })`; `confirm: true` → `needsApproval`
- `available(ctx)` imports flags modules only, never actions modules; `tools/index.ts` auto-collects domain files (stubs registering nothing)
- Client-safe `lib/assistant/tool-summaries.ts` shared with the server registration
- Unit tests: approval flag, capability gating, unavailable when flag false

**R1-39** ConfirmationCard
- Renders the `approval-requested` part with the summary from `tool-summaries.ts`
- Confirmar / Cancelar call `onRespond(approved)`; states Hecho / Cancelado / error copy
- a11y test

**R1-40** render_table / render_timeline
- `AssistantTableMessage` → `RecordTable`, `AssistantTimelineMessage` → `AgendaWidget` with `RenderTableArgs` / `RenderTimelineArgs`
- Follow the user's style through the widgets; tests per style

**R1-41** Cutto links
- `channelUrl`, `meetingUrl`, `personChatUrl` from `NEXT_PUBLIC_CUTTO_BASE_URL`, client-safe
- `CuttoClient` interface + no-op in `cutto-api.server.ts`; no client import of it (lint / test)
- Unit tests

**R1-42** Capabilities
- `canManageAppearance`, `canManageGeneralSettings` (today's General rule), `canManageTimeTracking`, `canViewTeamHours` (Administrador, Dirección), `canDecideVacations`, `canSeeAdminData` re-export
- Role table unit test

**R1-43** /ajustes guards and AjustesNav
- One `app/(staff)/ajustes/(admin)/<segment>/layout.tsx` per segment → `requirePageCapability(cap)` → `notFound()`; `/ajustes/horario` admits either capability
- `/ajustes` → `/ajustes/apariencia`; `AjustesNav` Personal / Organización with "Admin" badges, items absent from the DOM without the capability; Tramos / Puestos only when Project Flow pages exist
- `AppRouteGuard` prefix check kept only for legacy `/configuracion`
- Server test per segment (non-admin 404 on permisos, general, estatus)

**R1-44** compat.ts
- `listTramos`, `tramoLabel`, `tramoColorSlot`, `tramoColorVar`, `phaseLabel` (null without fase catalog), `canSeeAdminData` (Project Flow when present, else `isAdministratorRole`)
- Unit tests with and without Project Flow data

---

## Phase 2: Shell, Navigation and States

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R2-01 (#788) | [BE]: searchWorkspaceAction and lib/search/search.ts | L | Search | `BuscarCmdK` | Phase 1 |
| R2-02 (#790) | [FE]: CommandPalette (⌘K) with the actions group | M | Search | `BuscarCmdK` | Phase 1 |
| R2-03 (#792) | [FE]: Legacy route redirect stubs (flag-aware, query preserved) | M | Redirects | — | Phase 1 |
| R2-04 (#794) | [FE]: New-only route redirects when the flag is off and canonical link redirects | S | Redirects | — | Phase 1 |
| R2-05 (#796) | [FE]: Avatar menu in the new Sidebar | M | Shell | `Sidebar` | Phase 1 |
| R2-06 (#798) | [FE]: Opt-in banner on the legacy dashboard and legacy menu entry | S | Shell | — | Phase 1 |
| R2-07 (#801) | [FE]: BottomTabs and the mobile compact top bar | M | Mobile | `MovilInicio`, `MovilTareas`, `MovilMiEspacio`, `MovilProyecto` | Phase 1 |
| R2-08 (#806) | [FE]: not-found, route-group error / loading and offline banner | S | States | `Error404`, `EstadosSistema` | Phase 1 |

**R2-01**
- Five types ranked per BE §8.9; URLs of BE §7.3
- Capability scopes, owner-only notes, no admin tasks / client data without `canSeeAdminData` (db test)
- `INVALID` under 2 chars, `RATE_LIMITED`; flags flipped

**R2-02**
- ⌘K opens; debounce 200 ms; < 2 chars → "Escribe al menos 2 letras." and no call
- Results grouped by type, opened by their URL; static Acciones group, "Registrar entrada" only when `fetchMyTodayAction().enabled`
- Footer hints; keyboard navigation; a11y test

**R2-03**
- Every row of FE §2.2 redirects with the flag on (query preserved); renders as today with it off
- `/actividades/[tramo]?project=X` adds `iniciar=1`
- Vitest per stub; Playwright shell + navigation + redirects recorded

**R2-04**
- `lib/ui/redesign-redirect.ts` implemented: new-only routes → legacy equivalent when off
- `/tareas/[id]` → `/tareas?tarea=[id]`, `/mi-espacio/notas/[id]` → `/mi-espacio?nota=[id]`
- Tests both directions

**R2-05**
- Menu: Perfil, Apariencia, Instagram / Sitio web / Correo (from General settings), photo upload / remove via the Phase 1 routes, "Volver al diseño anterior", "Cerrar sesión"
- "Volver al diseño anterior" sets `redesignEnabled: false` and refreshes into the legacy UI
- a11y test

**R2-06**
- Dismissible banner "Prueba el nuevo diseño" + "Activar" on the legacy dashboard; legacy entry "Probar el nuevo diseño" placed without editing `components/layout/Sidebar.tsx` / `Header.tsx`
- Calls `updateMyPreferencesAction({ redesignEnabled: true })` + `router.refresh()`; `DISABLED` copy when the org kill switch is off
- Works for a non-admin; test

**R2-07**
- Under 768 px: sidebar hidden, BottomTabs (Inicio, Tareas, Mi espacio, Proyectos, Más → Sheet), compact top bar with title, TimeClock compact slot, avatar
- Touch targets ≥ 44 px; no horizontal scroll at 390 px
- Tests at both breakpoints

**R2-08**
- `app/not-found.tsx` per FE §3.12 ("Buscar" opens the palette only when its flag is on)
- `error.tsx` / `loading.tsx` per route group with `ErrorState` / `LoadingSkeleton`
- Offline banner on `navigator.onLine === false`; a11y tests

---

## Phase 3: Inicio, Tareas y Calendario

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R3-01 (#812) | [BE]: fetchInicioAction | L | Inicio | `Dashboard`, `InicioEsencial`, `InicioAnalitico` | Phase 1 |
| R3-02 (#816) | [FE]: Inicio page with the header block, ProfilePhotoButton and widgets | L | Inicio | `Dashboard`, `InicioEsencial`, `InicioAnalitico`, `InicioCalido`, `InicioGrafito`, `InicioOscuro`, `MovilInicio` | Phase 1 |
| R3-03 (#820) | [FE]: Tareas page shell: query, TareasClient, filters and view switch | M | Tareas | `Tareas`, `MovilTareas` | Phase 1 |
| R3-04 (#824) | [FE]: Tareas · Tablero view on TaskBoardWidget | M | Tareas | `Tareas`, `TareasEsencial`, `TareasAnalitico` | Phase 1 |
| R3-05 (#827) | [FE]: Tareas · Lista view and the Project Flow start slot | M | Tareas | `TareasLista`, `TareasListaEsencial`, `TareasListaAnalitico` | Phase 1 |
| R3-06 (#830) | [FE]: Tareas · Calendario month, week and day views | L | Calendario | `Calendario`, `CalendarioEsencial`, `CalendarioAnalitico`, `CalendarioSemana`, `CalendarioSemanaEsencial`, `CalendarioSemanaAnalitico`, `CalendarioDia` | Phase 1 |
| R3-07 (#833) | [FE]: EventDetailPopover | S | Calendario | `EventoDetalle` | Phase 1 |
| R3-08 (#836) | [FE]: TaskSheet (/tareas?tarea=) | L | Tareas | `TareaDetalle` | Phase 1 |
| R3-09 (#840) | [FE]: NewTaskDialog | M | Tareas | `NuevaTarea` | Phase 1 |
| R3-10 (#845) | [BE]: Notify hooks in tasks-actions.ts | S | Notifications | — | Phase 1 |
| R3-11 (#848) | [BE]: Daily producer vencimiento | M | Notifications | — | Phase 1 |
| R3-12 (#851) | [FE]: Update e2e for dashboard, tablero, mis-tareas and calendario routes | S | Tests | — | Phase 1 |

**R3-01**
- `InicioData` exactly as BE §7.10, via the metrics helper and widget builders; `myDay` includes `remindersForDay`
- Scoped by `scopeDashboardProjects/Tasks`; admin tasks / client data only with `canSeeAdminData` (db test)
- `completadas_semana` has `visibleIn: ["analitico"]`; flag flipped

**R3-02**
- Header block per FE §3.2 (greeting by hour, lowercase es-MX date, "Nueva tarea", `EstiloSwitch`); `ProfilePhotoButton` re-encodes and uploads; `TOO_LARGE` / `INVALID_TYPE` copy
- Composition of seven library widgets only; no per-style markup
- Same KPI numbers in three styles (test); empty states; nav item `inicio`
- a11y in all themes / modes

**R3-03**
- `parseTareasQuery` / `toTareasSearch` round trip; filters write the URL with `router.replace` (no scroll)
- `FiltersBar` tramo chips with counts, "Responsable: Yo", Proyecto, search; view switch links with `aria-current`
- Nav item `tareas` with my-overdue badge; empty "No hay tareas con estos filtros" + "Quitar filtros"

**R3-04**
- `ListPage` `spec.kind = "board"` with `TaskBoardWidget`; `setTaskStatusAction` optimistic with rollback toast
- Collapsed empty columns; keyboard "Mover a…"
- Three styles from the same data

**R3-05**
- Grouped `RecordTable` with by-project summary columns via `hideOn`
- Single tramo + Project Flow present → "Listos para iniciar" / "Próximos" + `StartTramoSheet`; `project=X&iniciar=1` opens it; absent otherwise
- Three styles

**R3-06**
- `AgendaWidget` mes / semana / día over `UnifiedCalendar` logic; toolbar with "Mes anterior" / "Mes siguiente" labels, lowercase month title, tramo legend
- Aside: day agenda, "Entregas por semana", `CalendarFeedDialog`
- Mes and Semana in three styles, Día one style

**R3-07**
- Extends the `UnifiedCalendar` popover; title, time, project chip, attendees, location, linked tasks, Editar / Eliminar
- "Abrir en Cutto" only with a stored `meetingUrl`, new tab, `rel="noopener"`

**R3-08**
- Opens over the mounted view from `?tarea=<id>`; close removes the param, view never unmounts
- Extends `TaskDrawer` on `FormSheet`; properties grid, subtareas, adjuntos, history timeline, comment composer with "@" mentions
- Fase / Espacio render only when the data exists

**R3-09**
- Extends `NewTaskModal` on `FormDialog`; `?nueva=1` opens it
- Fase list only from the selected tramo (hidden without a catalog); "Usar plantilla del tramo"
- `createUserTaskAction` errors through `actionErrorText`

**R3-10**
- Three `after(() => notify(...))` calls at the end of `assignTaskAction`, `createUserTaskAction`, `addTaskCommentAction` (asignación, comentario, mención)
- Actor never notified; tests for call counts
- Rebase note for Project Flow Phase 2

**R3-11**
- `vencimiento.ts` produces tasks due tomorrow and overdue, dedupe per task / day
- Admin tasks only to admins; runs only inside `daily-digest`
- db test

**R3-12**
- Existing specs for `/dashboard`, `/tablero`, `/mis-tareas`, `/calendario` updated to the new routes (flag on) and kept for flag off
- New flow: board drag + task sheet open / close
- Local run recorded on the issue

---

## Phase 4: Proyectos, Personas, Biblioteca y Vacaciones

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R4-01 (#803) | [BE]: fetchProjectsPortfolioAction | M | Proyectos | `ProyectosAnalitico` | Phase 1 |
| R4-02 (#807) | [BE]: fetchPeopleOverviewAction and fetchPersonaDetailAction | L | Personas | `PersonasAnalitico`, `PersonaDetalle` | Phase 1 |
| R4-03 (#810) | [BE]: Vacation actions and balance | L | Vacaciones | `MisVacaciones` | Phase 1 |
| R4-04 (#814) | [FE]: Proyectos list in three styles and NewProjectDialog | M | Proyectos | `Proyectos`, `ProyectosEsencial`, `ProyectosAnalitico`, `NuevoProyecto` | Phase 1 |
| R4-05 (#818) | [FE]: ProjectTabs, project header and the Resumen tab | L | Proyecto | `Proyecto`, `ProyectoEsencial`, `ProyectoAnalitico`, `MovilProyecto` | Phase 1 |
| R4-06 (#822) | [FE]: Proyecto · Tareas tab | M | Proyecto | `ProyectoTareas`, `ProyectoTareasEsencial`, `ProyectoTareasAnalitico` | Phase 1 |
| R4-07 (#825) | [FE]: Proyecto · Cronograma tab and printable report restyle | M | Proyecto | `ProyectoCronograma`, `ProyectoCronogramaEsencial`, `ProyectoCronogramaAnalitico`, `ProyectoReporte` | Phase 1 |
| R4-08 (#828) | [FE]: Proyecto · Archivos, Clientes and Ficha tabs | M | Proyecto | `ProyectoArchivos`, `ProyectoArchivosEsencial`, `ProyectoArchivosAnalitico`, `ProyectoClientes`, `ProyectoFicha` | Phase 1 |
| R4-09 (#831) | [FE]: Personas · Equipo tab and PersonasTabs | M | Personas | `Personas`, `PersonasEsencial`, `PersonasAnalitico` | Phase 1 |
| R4-10 (#834) | [FE]: Personas · Clientes, Contratistas and Proveedores tabs | M | Personas | `PersonasClientes`, `PersonasContratistas`, `PersonasProveedores` (+ `…Esencial`, `…Analitico`) | Phase 1 |
| R4-11 (#837) | [FE]: Persona detalle | M | Personas | `PersonaDetalle`, `PersonaDetalleEsencial`, `PersonaDetalleAnalitico` | Phase 1 |
| R4-12 (#839) | [FE]: Biblioteca index, sección and documento | L | Biblioteca | `Biblioteca`, `BibliotecaEsencial`, `BibliotecaAnalitico`, `BibliotecaSeccion` (+ variants), `BibliotecaDocumento` | Phase 1 |
| R4-13 (#844) | [FE]: Mis vacaciones | M | Vacaciones | `MisVacaciones`, `MisVacacionesEsencial`, `MisVacacionesAnalitico` | Phase 1 |
| R4-14 (#849) | [FE]: Solicitudes del equipo and Días de vacaciones | M | Vacaciones | `MisVacaciones` (deciders' section) | Phase 1 |
| R4-15 (#852) | [FE]: Update e2e for equipo, directorio and recursos routes and add the vacation flow | S | Tests | — | Phase 1 |

**R4-01**
- `PortfolioRow` per BE §7.12; `budgetSpentPct` null without `canSeeAdminData`
- `nextDelivery` never an admin task; open / overdue exclude admin tasks (db test)
- Flag flipped

**R4-02**
- `PeopleOverviewRow` and `PersonaDetail` per BE §7.11; availability from `approvedAbsences` + load thresholds
- `weekHours` only for `canViewTeamHours` or self; admin tasks only with `canSeeAdminData` (db test)
- Flags flipped

**R4-03**
- All eight actions of BE §7.8 with `INVALID`, `OVERLAP`, `STARTED`, `FORBIDDEN` (never decide one's own)
- Request notifies deciders (`vacaciones-solicitud`); decision notifies the requester (in-app + `vacaciones-decision`)
- Kind masked to `"ausencia"` except owner / deciders; balance uses override or org default
- Acceptance db test request → decision → balance; flags flipped

**R4-04**
- `ListPage` cards → `EntityCardGrid` + "Proyectos por tramo" `DistributionWidget`; three styles; "Presup. ejercido" column absent for non-admins
- `NewProjectDialog` extends `ProjectCreateModal` (Project Flow fields); `?nuevo=1`
- Nav item `proyectos`; empty "Aún no hay proyectos" + "Nuevo proyecto"

**R4-05**
- `ProjectTabs` extends `ProjectSectionNav` (Clientes only with `portal.manageAccess`); header, breadcrumb, actions
- Resumen in three styles from library widgets; budget admins only
- "Cliente y contactos" absent for a non-member without `canViewClients` (test); Cutto chat links via `cutto-links.ts`

**R4-06**
- Tasks grouped by fase / partida with progress per group; rows link `/tareas?tarea=<id>`; "+ Agregar tarea" per group
- Three styles via grouped `RecordTable`; groups by tramo when no fase catalog

**R4-07**
- Cronograma tab on `CronogramaWidget` (existing panels untouched); three styles
- `/cronograma/reporte` restyled for print; no style switch

**R4-08**
- Archivos via `ListPage` cards with storage-by-type table; three styles; empty "Este proyecto aún no tiene archivos"
- Clientes and Ficha: existing behavior in the new shell and tokens

**R4-09**
- `PersonasTabs` as links with counts, keeping the style; nav item `personas`
- Equipo via `ListPage` `kind = "people"`: availability week, cards, Analítico table; hours column only when returned
- "Abrir chat en Cutto" link

**R4-10**
- Clientes / Contratistas / Proveedores from `fetchContactsAction` with sub-filter chips on Proveedores
- `?contacto=<id>` opens `ClientDetailSheet`; Analítico columns only when data exists
- Empty "Aún no hay {…}" + "Agregar"

**R4-11**
- `PersonaDetail` from `KpiWidget`, `ProgressListWidget`, `AttentionListWidget`, single-row `PeopleWidget`; replaces `MemberProfileModal` content
- No admin task for non-admins (fixture test); three styles

**R4-12**
- Index (`EntityCardGrid`), sección (`ListPage` + `RecordTable`, favorite toggle), documento (`DocumentReader` with TOC); evolves `ResourcesWorkspace`
- "Abiertos recientemente" from the existing localStorage key; views / downloads columns not built
- "Preguntar al asistente" only when the assistant flags are on; nav item `biblioteca`

**R4-13**
- Balance, `VacationForm` (`OVERLAP` copy), history with cancel (`STARTED` copy), team strip with "Ausencia" masking
- "Documentos" lists the `mis-vacaciones` resource rows
- Three styles

**R4-14**
- Visible only for `canDecideVacations`; pending `RecordTable` with Aprobar / Rechazar (`FormDialog` with note); own requests never listed
- `SettingsSection` "Días de vacaciones": org days + per-person overrides
- Tests for visibility

**R4-15**
- Existing specs for `/equipo`, `/directorio`, `/recursos` updated (flag on) and kept (flag off)
- New flow: request → approve → balance updated
- Local run recorded

---

## Phase 5: Mi espacio, Bandeja y Gmail

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R5-01 (#841) | [BE]: Notification actions | M | Bandeja | `MiEspacio`, `AjustesNotificaciones` | Phase 1 |
| R5-02 (#843) | [BE]: Notes and checklists actions | M | Mi espacio | `MiEspacio`, `NotaEditor` | Phase 1 |
| R5-03 (#847) | [BE]: Reminder parser, reminder actions and the reminders-fire job | L | Recordatorios | `NuevoRecordatorio` | Phase 1 |
| R5-04 (#850) | [BE]: Gmail incremental consent, sync and the gmail-sync job | L | Gmail | `AjustesIntegraciones` | Phase 1 |
| R5-05 (#853) | [BE]: Gmail thread, link, task, draft / send actions and attachments route | L | Gmail | `MiEspacioGmail` | Phase 1 |
| R5-06 (#854) | [INFRA]: Enable the Gmail API and scopes on the Google OAuth client | S | Gmail | — | none |
| R5-07 (#856) | [FE]: Mi espacio page, QuickCapture, nav item and Bandeja badge | M | Mi espacio | `MiEspacio`, `MiEspacioEsencial`, `MiEspacioAnalitico`, `MovilMiEspacio` | Phase 1 |
| R5-08 (#858) | [FE]: Bandeja with tabs, rows and polling | M | Bandeja | `MiEspacio`, `MiEspacioEsencial`, `MiEspacioAnalitico` | Phase 1 |
| R5-09 (#860) | [FE]: GmailReader and GmailDraftSheet with send confirmation | L | Gmail | `MiEspacioGmail` | Phase 1 |
| R5-10 (#862) | [FE]: Notes grid and NoteEditor | M | Mi espacio | `MiEspacio`, `NotaEditor` | Phase 1 |
| R5-11 (#865) | [FE]: Reminders list and ReminderDialog | M | Recordatorios | `MiEspacio`, `NuevoRecordatorio` | Phase 1 |
| R5-12 (#867) | [FE]: Checklists | S | Mi espacio | `MiEspacio` | Phase 1 |
| R5-13 (#869) | [FE]: Ajustes › Notificaciones | M | Ajustes | `AjustesNotificaciones` | Phase 1 |
| R5-14 (#871) | [FE]: Ajustes › Integraciones | M | Ajustes | `AjustesIntegraciones` | Phase 1 |

**R5-01**
- Four actions of BE §7.4 with cursor pagination and `unreadCount`; others' ids ignored on mark-read
- Preferences one row per kind with defaults; `INVALID`
- Flags flipped; owner tests

**R5-02**
- Notes (create / update / archive / restore) and checklists (create, add, toggle, reorder with `lockForUpdate`, archive) on `ownerScoped`
- `INVALID` rules (empty, body > 20 000, project not visible)
- Owner suite instances; flags flipped

**R5-03**
- `parseReminderText` passes every BE §8.4 row incl. "a las 3" and "31 de febrero" → null
- `createReminderAction` (`PAST_TIME`), snooze, cancel, fetch; repeat advancement (daily, weekly, monthly on the 31st)
- `reminders-fire` job: in-app + `recordatorio` email via `notify` within one minute of due time
- Acceptance db test reminder → tick → in-app row + email sent; flags flipped

**R5-04**
- `?grant=gmail` alias with `gmail.readonly` + `gmail.compose` incremental consent; reconnect clears `disconnected_at` and full-syncs
- `lib/gmail/client.ts`, `sync.ts` (history id, backoff), `suggest.ts`, `sanitize.ts` (allowlist)
- `gmail-sync` job with `GMAIL_SYNC_MAX_PER_TICK`, oldest first, skips disconnected; `gmail.sync_failed` log

**R5-05**
- Status, threads, live thread read (sanitized), `syncGmailAction` (`RATE_LIMITED`), link (history comment), create task, drafts updated by `draftId` with `confirmToken`, send (`CONFIRM_REQUIRED`, `EXPIRED`), disconnect (cache deleted, token kept)
- Attachments route: owner only, 401 / 404 / 409
- Flags flipped; tests incl. draft reuse and disconnect

**R5-06**
- Gmail API enabled; scopes on the consent screen of the staff OAuth client; app audience confirmed internal to the Workspace domain
- `GMAIL_SYNC_MAX_PER_TICK` documented; findings recorded on the issue

**R5-07**
- Header "Mi espacio" + "Solo tú lo ves", description, `EstiloSwitch`; `?nota=<id>` opens the editor
- `QuickCapture` routing: "- [ ]" → checklist, parsed `dueAt` → `ReminderDialog`, else note
- Nav item `mi-espacio` with unread badge; Bandeja badge sidebar slot loader; three styles

**R5-08**
- Tabs Todo / Gmail / Notificaciones / Menciones with counts; rows per FE §3.3; Gmail chip or "Conectar Gmail"
- Notification rows link to `url` and mark read; 60 s poll while visible updates the badge
- Empty "Todo al día"; three styles via `RecordTable`

**R5-09**
- Reader: headers, body in `<iframe sandbox srcdoc>`, remote images off with "Mostrar imágenes", attachment links
- Draft sheet on `FormSheet` saving with `draftId`; "Enviar" only after the `FormDialog` confirmation; `EXPIRED` re-saves
- "Crear tarea" and "Vincular a proyecto" with the bitácora note; tests

**R5-10**
- `NotesGrid` as `EntityCardGrid` with tints by color, pin; empty "Escribe tu primera nota"
- `NoteEditor` on `FormSheet` (toolbar, swatches, pin, "Convertir en tarea" opens `NewTaskDialog` prefilled when its flag is on)
- Archive toast "Nota archivada" + "Deshacer" (10 s)

**R5-11**
- Reminders "hoy y mañana" with Posponer 1 h / Mañana / Cancelar; empty "Sin recordatorios para hoy y mañana"
- `ReminderDialog` on `FormDialog` with parsed chip, date + time, Repetir, link, channels; `PAST_TIME` copy
- Playwright note / checklist / reminder flow with a test tick call, recorded

**R5-12**
- `ChecklistCard` reusing the task checklist rows: n/m, progress, toggles with rollback, add item
- Three styles

**R5-13**
- Kind × channel matrix (7 × 3), quiet hours, "Resumen diario a las 07:30"; no Cutto column
- Settings section files under `lib/shell/settings-sections/notificaciones/`; `SettingsSection` / `SettingsRow`
- Save via `updateNotificationPreferencesAction`; a11y

**R5-14**
- Gmail card (Conectar, Sincronizar ahora, Desconectar dialog with the exact FE §3.8 copy and "Abrir permisos de Google")
- Google Calendar, Drive (existing controls), Cutto link-only card, monday link
- a11y

---

## Phase 6: Ajustes, tema y Control de horario

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R6-01 (#800) | [BE]: saveOrgAppearanceAction and resetOrgAppearanceAction | M | Tema | `AjustesAdmin` | Phase 1 |
| R6-02 (#804) | [FE]: Ajustes › Tema y estilo (ThemeEditor) | L | Tema | `AjustesAdmin` | Phase 1 |
| R6-03 (#808) | [FE]: Ajustes › Apariencia | M | Tema | `Ajustes` | Phase 1 |
| R6-04 (#811) | [BE]: Time tracking settings, state machine and clock actions | L | Horario | `AjustesHorario`, `Sidebar` | Phase 1 |
| R6-05 (#815) | [BE]: Team hours report, CSV export and the auto-close-jornadas job | L | Horario | `AjustesHorarioAnalitico` | Phase 1 |
| R6-06 (#819) | [FE]: TimeClock sidebar slot | M | Horario | `Sidebar` (tracker on), `MovilInicio` | Phase 1 |
| R6-07 (#823) | [FE]: ClockInPrompt at the first login of the day | M | Horario | `LoginJornada` | Phase 1 |
| R6-08 (#826) | [FE]: Ajustes › Control de horario and TeamHoursTable | L | Horario | `AjustesHorario`, `AjustesHorarioEsencial`, `AjustesHorarioAnalitico` | Phase 1 |
| R6-09 (#829) | [FE]: Ajustes › Perfil | M | Ajustes | `Perfil` | Phase 1 |
| R6-10 (#832) | [BE]: Switch General settings save / restore to canManageGeneralSettings | S | Ajustes | — | Phase 1 |
| R6-11 (#835) | [FE]: Ajustes › General with header link fields | M | Ajustes | `AjustesGeneral` | Phase 1 |
| R6-12 (#838) | [FE]: Restyle Ajustes › Estatus and Permisos | M | Ajustes | `AjustesEstatus`, `AjustesPermisos` | Phase 1 |
| R6-13 (#842) | [FE]: Restyle Ajustes › monday and Google pages, Tramos / Puestos links | M | Ajustes | `AjustesMonday`, `AjustesAreas` (layout reference) | Phase 1 |
| R6-14 (#846) | [FE]: Update e2e for configuracion routes and add theme and time-tracking flows | S | Tests | — | Phase 1 |

**R6-01**
- `canManageAppearance`; `LOW_CONTRAST: <pair> <mode> <ratio>` from `lib/ui/contrast.ts`; `INVALID`
- Revalidates the root layout and bumps `v`; reset keeps style / override / redesign settings
- Acceptance db test: save → next load renders the new block; flags flipped

**R6-02**
- Evolves `PrimaryColorPicker` into `TokenRow`; "Partir de" presets; Claro / Oscuro edit switch; typography and shape rows
- Sticky live preview + `ContrastBadge`; "Publicar para todos" disabled while any pair fails, failing rows marked
- "Restablecer" with `FormDialog` confirm; "Exportar CSS"; tests of FE §17

**R6-03**
- Theme and style radio cards, modo, densidad, text size slider (debounced), live preview, "Nuevo diseño" switch
- Applies without reload via `useAppearance`; disabled cards with the override copy
- a11y; radio groups by keyboard

**R6-04**
- Settings fetch / save with every `INVALID` rule; `fetchMyTodayAction` with `requiredFrom` / `hoursPerDay`
- Clock in / pause / resume / out with `DISABLED`, `ALREADY_ON`, `NOT_ON`, row lock on pauses; `fetchMyWeekHoursAction`
- State machine unit table incl. exempt and non-work days; flags flipped

**R6-05**
- `fetchTeamHoursAction` (`canViewTeamHours`, targets minus approved absences)
- `/api/horario/export`: 403, BOM, trial entries excluded, formula escaping
- `auto-close-jornadas`: flagged auto-close at `autoCloseAt` / `dayEnd`; missing clock-in notification at dayStart + 2 h only when required
- Acceptance db test clock in → pause → resume → auto-close → report

**R6-06**
- Card and compact variants; states and buttons per FE §3.13; ticking from `startedAt`, re-sync on focus / 5 min
- `role="timer"`, polite announcements, reduced motion; rollback on `NOT_ON`
- Renders only when enabled and not exempt; "Opcional hasta el {fecha}"

**R6-07**
- Shown at the first staff page of a work day when enabled, off and `promptAtLogin`
- Dismissible before `requiredFrom`; not dismissible after (no Escape / outside click / "Ahora no"); "Cerrar" after an error other than `ALREADY_ON`
- Calls `clockInAction({ source: "login" })`; tests

**R6-08**
- Settings sections per FE §3.8 (switch, required-from min tomorrow, timeline, rules, prompt preview); location option not built
- `TeamHoursTable` on `RecordTable` in three styles with "Exportar CSV"
- Dirección: report + read-only rules; each section checks its own capability

**R6-09**
- Photo via the Phase 1 route (re-encode) and `removeMyPhotoAction`; "Mis horas esta semana" only when enabled
- Editable own fields, read-only puesto / correo / idioma; "Cambiar contraseña"
- a11y

**R6-10**
- `saveGeneralSettingsAction` / `restoreGeneralSettingsAction` guarded by `canManageGeneralSettings`
- Action tests for allowed / denied roles

**R6-11**
- `GeneralSettingsWorkspace` on `SettingsSection` / `SettingsRow`; Instagram / Sitio web / Correo fields saved in `general_settings`
- The avatar menu links read them (no localStorage)
- a11y

**R6-12**
- `EstatusClient` and `PermissionsWorkspace` in the new shell on `SettingsSection`; storage unchanged
- No behavior change (existing tests green)

**R6-13**
- monday page (+ history) and Google settings / group mappings restyled; wizard steppers left to Phase 8
- Tramos / Puestos entries link to Project Flow pages when present, hidden otherwise
- No behavior change

**R6-14**
- Existing `/configuracion/*` and `/profile` specs updated (flag on) and kept (flag off)
- New flows: admin publishes a theme and another user sees it; enable time tracking → clock in / pause / out → required date makes the prompt mandatory
- Local run recorded

---

## Phase 7: Asistente en todas partes

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R7-01 (#787) | [BE]: Chat route with server threads, native approvals and context safety | L | Runtime | `Asistente`, `AsistentePagina` | Phase 1 |
| R7-02 (#789) | [BE]: Assistant thread, audit and legacy import actions | M | Runtime | `AsistentePagina` | Phase 1 |
| R7-03 (#791) | [BE]: Assistant tools: Consulta y búsqueda (4) and Tareas (6) | M | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-04 (#793) | [BE]: Assistant tools: Agenda y calendario (6, writes disabled) | M | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-05 (#795) | [BE]: Assistant tools: Notificaciones y recordatorios (7) | M | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-06 (#797) | [BE]: Assistant tools: Correo / Gmail (5) | M | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-07 (#799) | [BE]: Assistant tools: Mi espacio y jornada (6) | M | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-08 (#802) | [BE]: Assistant tools: Personas, clientes y proveedores (5) | M | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-09 (#805) | [BE]: Assistant tools: Herramientas de arquitectura (8) and takeoff calculator | L | Tools | `AsistenteHerramientas` | Phase 1 |
| R7-10 (#809) | [BE]: Assistant tools: Widgets de respuesta (3) and Cutto (15, disabled) | M | Tools | `AsistenteHerramientas`, `AsistenteWidgets` | Phase 1 |
| R7-11 (#813) | [FE]: AssistantButton and AssistantSheet with page context | L | UI | `Asistente` | Phase 1 |
| R7-12 (#817) | [FE]: Asistente full page with history and the Herramientas panel | M | UI | `AsistentePagina`, `AsistenteHerramientas` | Phase 1 |
| R7-13 (#821) | [FE]: Migrate existing assistant widgets onto the library | S | UI | `AsistenteWidgets` | Phase 1 |

**R7-01**
- Body `{ id, message?, approvals?, context }`; thread upsert by client id, another owner → 403; client-sent history ignored
- Context ids resolved through viewer-scoped reads; unknown ids dropped
- `needsApproval` round trip and dynamic approval after untrusted content; `assistant_actions` audit; `assistant.action` log
- Route tests incl. approval round trip

**R7-02**
- Threads list (max 50) / read / delete, `fetchAssistantActionsAction`, `importLegacyAssistantThreadAction` (≤ 200 messages, no model call)
- Owner tests; flags flipped

**R7-03 … R7-10** One issue per tool group, same acceptance shape:
- Every tool of the BE §10.3 group with schema, capability, `confirm`, `summarize(input)` and `available(ctx)` reading only the flags modules of the actions it calls (Rule 3)
- Confirmar tools declared `needsApproval`; confirmed shared-entity writes logged "vía asistente"; destructive actions archive
- Reads respect `canSeeAdminData` and owner scopes
- Unit tests: approval flag, capability, unavailable while a backing flag is false
- Group extras: Agenda event writes registered disabled with the "Aún no puedo crear eventos…" explanation; Arquitectura file tools return "no disponible" without image input; Cutto tools absent without `CUTTO_API_URL`

**R7-11**
- Floating button (⌘J, hidden on `/asistente`), sheet extends `AssistantChat`; Escape closes and focus returns
- Context chip only for server-confirmed context; client-generated thread id; sends only the new message or approvals
- `ConfirmationCard` for `approval-requested` parts; Confirmar / Cancelar via `addToolApprovalResponse`
- Playwright: opens on three pages with the right context; a confirm tool shows the card; recorded

**R7-12**
- History grouped Hoy / Esta semana / Anteriores with delete; conversation; Herramientas panel of starter prompts
- Legacy `cincel.asistente.thread.v1` imported once, key deleted on success
- Nav item `asistente`; flag off renders the legacy page

**R7-13**
- `AssistantChartMessage`, `AssistantCardMessage`, `AssistantStatGridMessage`, `AssistantListMessage` render through `DistributionWidget`, `WidgetCard`, `KpiWidget`, `AttentionListWidget`
- Follow the user's style; tests per style

---

## Phase 8: Acceso y portal

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R8-01 (#777) | [FE]: Restyle Login and LoginDenegado on the split layout | M | Acceso | `Login`, `LoginDenegado` | Phase 1 |
| R8-02 (#778) | [FE]: Restyle CambioContrasena | S | Acceso | `CambioContrasena` | Phase 1 |
| R8-03 (#779) | [FE]: Restyle the first-login wizards (Google and monday) | M | Acceso | `BienvenidaGoogle`, `BienvenidaMonday` | Phase 1 |
| R8-04 (#780) | [FE]: Restyle Portal login and Portal 404 | S | Portal | `PortalLogin`, `Portal404` | Phase 1 |
| R8-05 (#782) | [FE]: Portal project page in three styles with the portal style cookie | L | Portal | `PortalProyecto`, `PortalProyectoEsencial`, `PortalProyectoAnalitico` | Phase 1 |

**R8-01**
- Split layout (brand panel with CSS shapes, form card); "Continuar con Google" primary with neutral "G"
- Denied page: email, "Usar otra cuenta", "Contactar al administrador" (`mailto:` from `contactEmail`)
- Sign-in logic unchanged (existing e2e green); a11y

**R8-02**
- Same layout; existing form and validation unchanged; a11y

**R8-03**
- Google primeros pasos and monday wizard steppers restyled; steps and logic unchanged
- a11y; existing wizard tests green

**R8-04**
- Portal login and 404 in the organization theme; no client override
- a11y

**R8-05**
- `PhaseStepper`, `ProgressListWidget`, `AgendaWidget`, `RecordTable`; three styles from the same data
- `EstiloSwitch scope="portal"` in the top bar; style from `cincel-portal-style` in the portal layout, survives reload
- Approvals / messages only where portal data exists; a11y; portal e2e updated and recorded

---

## Phase 9: Cleanup

| ID | Title | Size | Workstream | Frames | Depends on |
|---|---|---|---|---|---|
| R9-01 (#781) | [FE]: Remove the ui.redesign flag branches, LegacyFrame and the opt-in UI | M | Cleanup | — | Phases 1–8 |
| R9-02 (#783) | [FE]: Delete the legacy shell and the replaced components | L | Cleanup | — | Phases 1–8 |
| R9-03 (#784) | [FE]: Regenerate the globals.css fallback from Azul and flip the drift guard | S | Cleanup | `Dashboard` (first-paint check) | Phases 1–8 |
| R9-04 (#785) | [FE]: Delete the localStorage readers | S | Cleanup | — | Phases 1–8 |
| R9-05 (#786) | [BE]: Remove appearance.primary_color and the legacy appearance reads | S | Cleanup | — | Phases 1–8 |

**R9-01**
- `(staff)/layout.tsx` always renders `AppShell`; `LegacyFrame`, banner, legacy entry, "Volver al diseño anterior" and the "Nuevo diseño" switch removed
- Redirect stubs redirect unconditionally; new-only routes no longer redirect to legacy
- Full Playwright suite recorded

**R9-02**
- `components/layout/Sidebar.tsx`, `Header.tsx`, `ThemeToggle.tsx`, the `primary-color` injection and every replaced component of FE §4.11.1 deleted
- `rg` check of the Phase 9 Done Definition clean

**R9-03**
- `npm run themes:css` regenerates `globals.css` from `THEME_PRESETS.azul`; drift guard asserts equality
- First paint without the appearance block matches Azul

**R9-04**
- Readers of `cincel.theme`, the profile photo, header links and `cincel.asistente.thread.v1` deleted
- No remaining `localStorage` reference for those keys

**R9-05**
- `appearance.primary_color` deleted from `app_settings`; `getPrimaryColor` removed
- `redesign_enabled` column kept (not asked by the specs)

---

## Not in this plan

- CI workflow `cincel-app-build.yml` (ubuntu-latest, no `timeout-minutes`, Playwright job, buildx): separate infra issue (review NB 26)
- `calendar.events` grant and the parametric costs editor (BE Annex C4 / C5, out of scope, FE RD-18)
- `AjustesWorkflows` automations, Cutto UI (`InicioCutto`, `CuttoLlamada`, open-mic dock), Biblioteca views / downloads tracking, time-tracking location
