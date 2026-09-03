# Phase 9: Primitive Consolidation — Avatar, Badge, Inline Editors, Cards

## Goal
Eliminate the true duplicate components (Avatar, Badge, inline editors) and migrate card-based components onto the shadcn Card primitive already installed in Phase 8, so every "card" and "badge" in the app uses a single implementation.

## Deliverables

### Frontend
- [ ] Install shadcn `progress` primitive under `components/ui/shadcn/progress.tsx`
- [ ] Create wrapper `components/ui/AppAvatar.tsx` that composes `shadcn/avatar.tsx` (AvatarImage + AvatarFallback) with the same `name`/`imageSrc`/`showName` props API as the current custom Avatar
- [ ] Replace all call sites of `components/ui/Avatar.tsx` with `AppAvatar` (~4 sites: Header, task/team tables)
- [ ] Delete `components/ui/Avatar.tsx`
- [ ] Create wrapper `components/ui/AppBadge.tsx` that composes `shadcn/badge.tsx` with a `variant` prop mapping the existing color palette (yellow/green/blue/red/gray/purple)
- [ ] Migrate `components/tasks/TaskStatusBadge.tsx` to use `AppBadge` internally
- [ ] Replace all remaining direct uses of `components/ui/Badge.tsx` with `AppBadge` (~8 sites across tasks, projects, team)
- [ ] Delete `components/ui/Badge.tsx`
- [ ] Consolidate `components/ui/InlineEditableField.tsx` and `components/proveedores/EditableCell.tsx` into a single `components/ui/InlineEditable.tsx` component; update all call sites
- [ ] Delete whichever file is no longer needed after consolidation
- [ ] Migrate `components/dashboard/KpiCard.tsx` to use shadcn `Card`/`CardContent`
- [ ] Migrate `components/proyectos/ProjectCard.tsx` to use shadcn `Card` + `Progress` + `AppBadge`
- [ ] Migrate `components/proyectos/ProjectModuleCard.tsx` to use shadcn `Card`
- [ ] Migrate `components/ui/GroupSection.tsx` to use shadcn `Card`/`CardHeader`/`CardTitle`

### Backend
- None (pure UI consolidation)

### Infrastructure
- None (shadcn already initialized in Phase 8; only `progress` primitive added)

## Done Definition
- `components/ui/Avatar.tsx` and `components/ui/Badge.tsx` are deleted from the repo
- All former Avatar/Badge call sites render identically using the new wrappers (visual regression check)
- Only one inline-editable component exists; both proveedores and general call sites use it
- KpiCard, ProjectCard, ProjectModuleCard, and GroupSection use shadcn Card internally
- ProjectCard renders a shadcn Progress bar for project completion
- No TypeScript errors; `npm run build` passes
- Existing E2E tests pass without modification

## Parallel work
- Avatar consolidation, Badge consolidation, and inline-editor consolidation are independent — can run in parallel
- Card migrations (KpiCard, ProjectCard, ProjectModuleCard, GroupSection) are independent of each other and can run in parallel with the above
- All work is frontend-only; no backend coordination needed

## Phase dependencies
- Requires: Phase 8 (shadcn init, card/badge/avatar primitives already installed)

## Complexity
- Backend: None
- Frontend: M (many call sites but each migration is mechanical)
- Infra: None

## Risks
- The custom Badge color palette (yellow/green/blue/red/gray/purple) must map cleanly to shadcn badge variants or Tailwind classes — may need custom CVA variants
- InlineEditableField and EditableCell may have subtle behavior differences (blur vs Enter handling, validation) that need careful reconciliation
- ProjectCard's Progress bar is a new visual element — ensure it matches the existing project completion display
