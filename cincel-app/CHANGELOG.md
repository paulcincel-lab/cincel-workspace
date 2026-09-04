# Changelog

All notable changes to Cincel Workspace, generated from the git history.
Newest first. No semver tags are cut for this project — entries are grouped
by date; PR numbers are in parentheses where the change was merged via a PR.

## 2026-09-03/04 — Phases 9–15 complete: full raw-HTML-to-shadcn/ui migration

Every raw `<button>`, `<input>`, `<select>`, and `<textarea>` in the app is now a shadcn primitive (two documented exceptions: `StarRating`'s bare-glyph stars and `PillDropdown`'s color-swatch buttons, neither of which fit shadcn's Button styling). Every overlay in the app is now a `Sheet` — the `Dialog` (centered modal) primitive was removed entirely.

- **refactor(ui):** every remaining `Dialog` usage (12 files: proveedores add-item forms, `ProjectCreateModal`, `ProjectNotesModal`, `NewTaskModal`, `NewProjectTemplateModal`, `MemberEditorDrawer`, `CoordinatorProjectsModal`, `MemberProfileModal`, `DrivePickerDialog`, `ResourcesWorkspace`'s 3 overlays) converted to `Sheet`; `components/ui/shadcn/dialog.tsx` deleted — zero centered modals remain (#242)
- **fix(ui):** `Sheet`'s base `w-[560px]` always wins over a `max-w-*` override (width and max-width don't conflict in tailwind-merge) — the two clientes Sheets had silently been stuck at 560px since #235; fixed with an explicit `w-[672px]` (#242)
- **feat(ui):** `UnifiedCalendar`, `AssistantChat`, `InteractiveDashboard` migrated to shadcn Button/Select/Textarea — the assistant chat's Enter-to-send `onKeyDown` verified unaffected (#241)
- **feat(ui):** `TeamMultiSelect`, `InlineEditable` migrated to shadcn Button/Input; `InlineEditable`'s display-trigger uses `h-auto p-0` to avoid layout shift on click (#240)
- **feat(ui):** `Sidebar`, `Header` migrated to shadcn Button/Input; verified no SSR regressions across all major routes (#239)
- **fix(proveedores):** `colaboradores`/`contratistas` Add-item forms had shadcn `Label`s not associated with their `Input`/`Select` (`htmlFor`/`id` missing) — a latent accessibility bug, found via audit rather than a failing test (#238)
- **feat(configuracion):** `PermissionsWorkspace`, `GeneralSettingsWorkspace` migrated to shadcn Select/Button; adds `components/ui/shadcn/switch.tsx` (new primitive, base-ui `Switch` wrapper) for the settings toggle pattern (#237)
- **feat(auth):** `login`, `change-password`, `profile` pages migrated to shadcn Input/Button/Checkbox; login verified to render correctly unauthenticated via a built production server (#236)
- **feat(clientes):** `ClientesPageClient` and the client detail page migrated to shadcn Input/Select/Button, both drawers to `Sheet` directly; CI caught a real Label/Input association bug (broke `clientes.spec.ts`'s `getByLabel` calls) and the e2e spec's native-`<select>` assumptions, both fixed before merge (#235)
- **feat(recursos):** `ResourcesWorkspace`, `DrivePickerDialog` migrated to shadcn primitives; adds `components/ui/shadcn/radio-group.tsx` (new primitive) for the "Quitar recurso" single-select (#234)
- **feat(equipo):** `MemberEditorDrawer`, `EquipoPageClient` migrated to shadcn primitives (#233)
- **feat(proveedores):** `contratistas` page migrated; its hand-rolled multi-select dropdown converted to `Popover`, deleting its own click-away `useEffect` (#232)
- **feat(proveedores):** `colaboradores` page migrated; its hover-reveal "Habilidades" filter converted to a click-based `Popover` + `Checkbox` list (#231)
- **feat(ui):** `tiendas` page migrated to shadcn primitives; its hover-hidden "Estado" filter normalized to an always-visible `Select`, matching its siblings (#230)
- **feat(ui):** `StarRating`, `PillDropdown`, `EditableCell` migrated to shadcn primitives (#229)
- **feat(ui):** `DataTable` migrated to the shadcn `Table` primitive; the fix that shipped alongside it — migrating `ExportMenu` to `Popover` — resolved a real stacking-context bug where bumping z-index alone did not fix a blocked dropdown in CI (#227)

## 2026-08-29

- **fix(asistente):** `onboard_client` now creates a real `projects` row instead of only a name snapshot on activities — fixes projects "started" through the assistant being invisible to `list_projects` and the Proyectos page (#133)
- **feat(google-drive):** per-user impersonation via Workspace domain-wide delegation, replacing the fixed-identity service account — Drive's own per-file permissions now apply exactly as they do outside the app (#135–#138, #139)
- **feat(asistente):** `discard_project` tool — soft-delete a project and all its tasks in one transaction, for cleaning up test/seeding projects; gated to Administrador/Dirección (#132)
- **refactor:** `client_contacts` / `project_members` writes diff against persisted rows instead of delete-all-and-reinsert, so an unrelated edit no longer churns every child row's `created_at` (#114, #131)
- **feat(db):** reconnect `activities.project_id` — backfill, resolve-on-write, and project-rename propagation to the task snapshot (ADR 0001) (#128, #130)
- **feat(db):** CHECK constraints on `projects.stage` and provider/contractor/store `status` (#110, #111, #129)
- **feat(db):** drop the dead `activities.manager_member_id` / `activity_support_members.team_member_id` / `activity_history.author_member_id` columns — never written, superseded by name snapshots (ADR 0001) (#127)
- **feat(asistente):** duplicate-detection and merge tools — `find_duplicates`, `merge_duplicate_clients`, `merge_duplicate_activities`, transactional and non-destructive (#126)
- **refactor(activities):** task history becomes append-only — `upsertActivity` previously deleted all bitácora rows and reinserted, which could silently drop history on a partial save (#113, #125)
- **feat(db):** `pg_trgm` + GIN indexes so the assistant's `ilike` filters (project/manager name, description) use an index (#109, #124)
- **feat(clients):** project rollup columns (`total_projects_worked`, `has_active_project`, …) are now derived live from `projects` instead of drifting denormalized columns (#114/#115 bookkeeping, #123)
- **feat(db):** `resource_links` gains real `uuid` FK columns to `team_members`, backfilled from the legacy bigint ids, dual-written going forward (#112, #122)
- **feat(db):** case-insensitive unique index on `clients.name`; NULL-safe unique on `project_members` (#105, #108, #121)
- **docs(adr):** `docs/adr/0001` (name-snapshot vs. foreign-key pattern) and `0002` (audit-log shapes) — the two schema-review decision records (#116, #117, #120)
- **feat(db):** partial unique index on `activities.legacy_id` + workflow (replacing a select-then-write with a single `onConflictDoUpdate`); indexes on the project/manager name snapshot columns (#104, #106, #119)
- **feat(asistente):** multiline chat input (Shift+Enter), thread persisted across reloads, idempotent `onboard_client` / `create_client` (#103)

## 2026-08-28 — Phases 4 & 5: Google Drive, AI assistant, deploy automation

- **chore(deploy):** auto-apply Drizzle migrations on `docker compose up` via a `migrate` service; deployment docs rewritten for Postgres/Drizzle (#102)
- **feat(phase-5):** assistant client-onboarding tools (`create_client`, `onboard_client`) + `docs/assistant.md` (#101)
- **feat(phase-5):** assistant is aware of the acting user's identity and role in its system prompt (#100)
- **feat(phase-5):** role-scoped assistant tools — different roles get different create/assign capabilities (#99)
- **test(phase-5):** opt-in live-LLM assistant e2e spec (`RUN_LIVE_ASSISTANT=1`) (#98)
- **feat(phase-5):** `/asistente` — streaming AI chat with tool calls and inline recharts charts (#97)
- **feat(phase-4):** Drive picker wired into the project ficha document fields (#96)
- **feat(phase-4):** Drive picker dialog + Recursos workspace integration (#95)
- **feat(phase-4):** Google Drive backend — service-account client, Drive v3 REST repository, API routes, schema columns (#94)
- **feat(phase-2):** dashboard converted to a Server Component; dropped the last localStorage mirror for business data (#93)
- **feat(phase-2):** tareas, equipo, and recursos converted to async Server Components (#92)
- **feat(phase-2):** clientes and proyectos converted to async Server Components (#91)
- **feat(phase-2):** client-history entity moved to Drizzle + Server Actions (#90)
- **chore(phase-3):** Supabase fully removed — client, RLS SQL, dependencies, config (#89)

## 2026-08-27/28 — Phases 1–3: Postgres + Drizzle migration, session auth

- **Phase 2 + 3:** every business entity moved to Drizzle repositories and Server Actions; scrypt password hashing + opaque cookie sessions replace Supabase Auth (#88)
- **Phase 1:** Postgres + Drizzle foundation — schema, migrations, seed script, docker-compose `db` service (#87)

## 2026-08-25/26 — Pre-migration hardening & QA

- **test:** temporary Administrador account for manual QA (#52)
- **fix(auth):** restored missing auth data in `team-public.ts` — had broken all localStorage-mode logins (#51)
- **refactor:** `equipo` page split into subcomponents (#50)
- **refactor(proyectos):** `ProjectsTable` split into a hook + subcomponents (#49)
- **refactor(proveedores):** shared UI widgets extracted into `components/proveedores/` (#48)
- **docs:** `AGENTS.md`, ERD, data dictionary updated; backup runbook added (#47)
- **refactor:** legacy `contratistas` route redirected; fetch loading/error states added
- **test(e2e):** real Clientes CRUD spec exercising the actual login flow (#45)
- **fix(m3b):** dialog overlay accessibility, `next/image` migration, backup cleanup, repo pagination (#44)
- **docs:** README rewritten with architecture/infra/use-case diagrams and a dev guide
- **fix(e2e):** E2E suite runs against a production build in CI, not `next dev` (#42)
- **fix(m1):** Supabase autosave scoped to changed rows only; task-refresh regression fixed
- **fix(e2e):** wait for full page load before filling login inputs
- **feat(data):** authorization at the data layer, task persistence, autosave fix, date constraints (#40)
- **test(qa):** vitest unit suite + Playwright E2E specs added to CI (#39)
- **feat(security):** Alpha M0 — server-side auth, middleware, scoped RLS policies, PII removal (#38)
- **ci:** build verification workflow added for cincel-app
- **feat(cincel-app):** Docker Compose deployment, modeled on masisa-proveedores

## 2026-07-24 to 2026-07-28 — Permissions, calendar, exports, sprint hardening

- **chore(sprint-11):** sprint closed with Supabase hardening, full E2E pass, and final documentation
- **chore(header):** `<img>` replaced with `next/image`
- **feat(export):** centralized export system + QA checklist
- **feat(calendar):** unified calendar module
- **feat(settings):** General Settings module with a centralized configuration service
- **feat(config):** configurable permission system
- **feat:** centralized permissions for enterprise resources, team, and clients
- **refactor:** beta access roles architecture migrated
- **feat(activities):** centralized action permissions
- **feat:** centralized permissions for resources
- **chore:** stable baseline established after authentication work

## 2026-07-14 to 2026-07-18 — Project start

- **feat:** activities UX improvements + interactive dashboard
- **chore:** workspace progress checkpoints and codespace recovery
- **Sprint 1:** base dashboard
- Initial commit
