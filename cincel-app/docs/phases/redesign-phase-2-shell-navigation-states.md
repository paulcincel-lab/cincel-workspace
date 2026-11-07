# Redesign Phase 2: Shell, Navigation and States

## Goal
A flag-on user can move around the whole app: old routes redirect to the new ones (and back when the flag is off), ⌘K searches the workspace, the avatar menu works, mobile has bottom tabs, every route group has its 404 / error / loading states, and anyone can opt in from the legacy dashboard.

## Deliverables

### Backend
- [ ] `lib/search/search.ts` + `searchWorkspaceAction` implemented: types `proyecto`, `tarea`, `persona`, `archivo`, `nota`; ranking of BE §8.9; capability scopes, owner-only notes, no admin tasks or client/origin data without `canSeeAdminData`; `INVALID` under 2 chars, `RATE_LIMITED`; URLs of BE §7.3 (BE §7.3, §8.9)
- [ ] `search-actions.flags.ts` entries flipped to true (Rule 1)
- [ ] Action tests (auth, codes) and db test for the admin-only filter (BE §16)

### Frontend
- [ ] Legacy routes of FE §2.2 become server `redirect()` stubs when the flag is on (query preserved; `/actividades/[tramo]?project=X` → `…&project=X&iniciar=1`); with the flag off they render exactly as today (FE §2.2, §2.3; BE §21.1)
- [ ] New-only routes (`/inicio`, `/mi-espacio`, `/tareas`, `/personas*`, `/biblioteca*`, `/ajustes/*`) redirect to their legacy equivalent when the flag is off, through the Phase 1 redirect helper that the page phases already call (FE §2.3)
- [ ] Canonical link redirects `/tareas/[id]` → `/tareas?tarea=[id]`, `/mi-espacio/notas/[id]` → `/mi-espacio?nota=[id]` (FE §2.2, RD-14)
- [ ] `CommandPalette` (⌘K, shadcn `Command` in `Dialog`): grouped results, 200 ms debounce, min 2 chars with "Escribe al menos 2 letras.", static "Acciones" group (Registrar entrada only when `fetchMyTodayAction().enabled`), footer hints; Sidebar search button appears once the flag flips (FE §3.12, RD-19)
- [ ] Avatar menu in the new Sidebar user block: Perfil, Apariencia, Instagram / Sitio web / Correo links from General settings, photo upload / remove through the Phase 1 photo routes, "Volver al diseño anterior" (`redesignEnabled: false` + `router.refresh()`), "Cerrar sesión" (FE §3.1, §2.3)
- [ ] Opt-in: dismissible banner on the legacy dashboard ("Prueba el nuevo diseño" + "Activar") and the legacy menu entry "Probar el nuevo diseño", both calling `updateMyPreferencesAction({ redesignEnabled: true })`; `DISABLED` copy when the org kill switch is off (FE §2.3)
- [ ] `BottomTabs` (< 768 px: Inicio, Tareas, Mi espacio, Proyectos, Más → `Sheet`) and compact top bar (title, TimeClock compact slot, avatar); touch targets ≥ 44 px (FE §3.1, §4.1)
- [ ] `app/not-found.tsx` ("No encontramos esta página", "Volver a Inicio", "Buscar"), `error.tsx` / `loading.tsx` per route group with `ErrorState` / `LoadingSkeleton`, offline banner (FE §3.12)
- [ ] Vitest: redirect stubs both directions, palette grouping and min length, avatar menu, BottomTabs, not-found; a11y test per new client (FE §17)
- [ ] Playwright: shell + navigation + redirects, run locally with `CI=1 npm run test:e2e`, result on the issue (FE §17)

### Infrastructure
- [ ] None

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- `BuscarCmdK.dc.html` — command palette
- `Error404.dc.html` — staff not-found page
- `EstadosSistema.dc.html` — route-level error, loading, offline banner, permission denied
- `Sidebar.dc.html` — avatar menu of the user block
- `MovilInicio.dc.html`, `MovilTareas.dc.html`, `MovilMiEspacio.dc.html`, `MovilProyecto.dc.html` — only the bottom tabs, "Más" sheet and compact top bar (page content belongs to Phases 3–5)
- No data view in this phase, so no Esencial / Analítico variants
- Not implemented: `InicioCutto`, `CuttoLlamada`

## Done Definition
- Flag on: every old route of FE §2.2 redirects to its target with the query preserved; flag off: old routes render as today and new-only routes redirect to legacy (FE §18 items 1 and 2)
- `/actividades/presale?project=X` lands on `/tareas?vista=lista&tramo=presale&project=X&iniciar=1`
- ⌘K finds a project, a task, a person, a Drive file and an own note; another user's note and admin tasks never appear for a non-admin (BE §17 items 9 and 13; FE §18 item 19)
- "Registrar entrada" is absent from the palette while `fetchMyTodayAction().enabled` is false
- A non-admin opts in from the legacy dashboard banner without visiting any admin page, and goes back from the avatar menu (FE §18 item 17)
- At 390 px every reachable page shows bottom tabs and no horizontal scroll (FE §18 item 14)
- Axe: no serious/critical violations on the palette, not-found and avatar menu in all three themes, light and dark (FE §18 item 13)
- Playwright shell / navigation / redirect run recorded on the issue; Vitest green in the existing CI

## Parallel work
- BE: `searchWorkspaceAction` ∥ FE: `CommandPalette` built against the Phase 1 stub (shows results once the flag flips)
- FE tracks: redirect stubs ∥ avatar menu + opt-in banner ∥ BottomTabs ∥ not-found / error / loading / offline
- Runs alongside Phases 3–8 (Rule 2)

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: M
- Frontend: M
- Infra: S

## Risks
- Until this phase merges, new-only routes don't redirect for flag-off users; acceptable because nothing links there while the flag defaults to off
- The legacy app has no user dropdown and `components/layout/Sidebar.tsx` / `Header.tsx` are untouched until Phase 9; place the legacy "Probar el nuevo diseño" entry where it needs no edit of those files (e.g. the legacy `/profile` page), and agree it on the issue
- `/actividades/*` is reworked by Project Flow Phase 2; keep the `project` → `iniciar=1` deep link in sync with its addendum
- Search ranking across five sources can get slow; respect `limit` and the rate limit, and measure on a production-sized copy
