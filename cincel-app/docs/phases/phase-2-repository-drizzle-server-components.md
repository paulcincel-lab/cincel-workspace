# Phase 2: Repository Layer to Drizzle + Server Components/Actions + TanStack Query/Zustand

## Goal
Flip the app to read/write real Postgres end-to-end, one entity at a time, using Server Components for initial render, Server Actions for mutations, TanStack Query for client caching, and Zustand for UI-only state.

## Deliverables

### Backend
- [ ] Rewrite `lib/repositories/clients-repository.ts` as server-only Drizzle module (keep exported function names + return types, drop localStorage/Supabase branching, keep snake_case-to-camelCase mappers, keep `legacy_id`-as-`id`)
- [ ] Rewrite `lib/repositories/projects-repository.ts` (same pattern)
- [ ] Rewrite `lib/repositories/team-repository.ts` (same pattern)
- [ ] Rewrite `lib/repositories/activities-repository.ts` (same pattern)
- [ ] Rewrite `lib/repositories/providers-repository.ts` (same pattern)
- [ ] Rewrite `lib/repositories/resources-repository.ts` (same pattern)
- [ ] Rewrite `lib/repositories/client-history-repository.ts` (same pattern)
- [ ] Authorization: every mutating function takes caller session and calls matching capability check from `lib/auth/permissions.ts` (`resolveProjectsCapabilities`, `resolveResourcesCapabilities`, etc.) before writing. `tests/unit/repository-authz.test.ts` stays green.
- [ ] `lib/actions/` (new) -- thin `"use server"` wrappers per entity (`projects-actions.ts`, `clients-actions.ts`, `team-actions.ts`, `activities-actions.ts`, `providers-actions.ts`, `resources-actions.ts`, `client-history-actions.ts`) calling `getSession()` then repository, then `revalidatePath()`/`revalidateTag()`
- [ ] Dashboard aggregates (do last -- reads from multiple repositories)

### Frontend
- [ ] `components/providers/QueryProvider.tsx` mounted in `app/layout.tsx` (TanStack Query)
- [ ] Client components switch from `useEffect(() => repo.fetchX())` to `useQuery({ queryKey, queryFn: () => fetchXAction(), initialData })` + `useMutation({ mutationFn: saveXAction, onSuccess: invalidate })`
- [ ] Zustand stores in `lib/stores/` for UI/session state only (active filters, selected project, current user) -- not server data
- [ ] Remove `lib/repositories/browser-state-repository.ts` usages for server data; keep trimmed version for client-only prefs only
- [ ] Pages become async Server Components where feasible: `app/proyectos/page.tsx`, `app/tareas/page.tsx`, `app/equipo/page.tsx`, `app/clientes/page.tsx`, `app/recursos/**`, `app/dashboard/page.tsx`, project detail routes -- `await` repository directly, pass data as `initialData` props
- [ ] Dependencies: `@tanstack/react-query`, `zustand`

### Infrastructure
- [ ] No new infrastructure (uses Phase 1 database)

## Done Definition
- For each entity: CRUD through the UI writes to Postgres (verifiable via `db:studio`)
- `npm run test:unit` green (especially `tests/unit/repository-authz.test.ts`)
- `npm run test:e2e` (equivalent of `scripts/e2e-login-crud-clientes.mjs`) passes against a running `db` container
- No localStorage reads/writes for business data remain
- `getXSnapshot()` sync localStorage paths and `isSupabaseEnabled()` branching removed from all repositories
- Server Components render initial data without client-side fetch waterfalls

## Parallel work
- BE: repository rewrites are independent per entity and can be parallelized (clients, projects, team can all start simultaneously)
- FE: QueryProvider + Zustand setup can run alongside BE repository rewrites
- FE: page-level Server Component conversion per route group can proceed entity-by-entity alongside BE

## Phase dependencies
- Requires: Phase 1 (database running, schema migrated, seed data)

## Complexity
- Backend: XL (7 repository rewrites + actions layer + authorization integration)
- Frontend: L (query/mutation migration for all entities + Server Component conversion)
- Infra: S

## Risks
- Entity migration order matters for foreign keys -- follow: clients -> projects -> team -> activities -> providers -> resources -> client-history -> dashboard
- Keeping backward compatibility during partial migration (some entities on Drizzle, others still localStorage) needs careful feature-flagging or atomic cutover per entity
- TanStack Query cache invalidation patterns must be consistent across all entities
