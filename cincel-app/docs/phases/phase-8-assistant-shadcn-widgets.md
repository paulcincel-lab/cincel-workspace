# Phase 8: Assistant Generative UI — shadcn/ui Widgets

## Goal
Extend the AI assistant's generative UI beyond charts with three new widget types (card, stat grid, list) built on shadcn/ui primitives, so the assistant can answer with structured visual responses instead of only prose or charts.

## Deliverables

### Backend
- [ ] Add `render_card` tool to `lib/assistant/tools.ts` — schema: `{ title, subtitle?, fields: {label, value}[], badge?: {label, tone} }`, no-op execute
- [ ] Add `render_stat_grid` tool — schema: `{ title?, stats: {label, value, badge?}[] }` (max ~6), no-op execute
- [ ] Add `render_list` tool — schema: `{ title, items: string[] }`, no-op execute
- [ ] Update `lib/assistant/prompt.ts` with guidance for when to use each widget vs chart
- [ ] Schema validation tests for all 3 new tools in `lib/assistant/tools.test.ts`
- [ ] Update ASSISTANT_TOOLS assertions (no role gating — available to all roles)

### Frontend
- [ ] Initialize shadcn/ui (`npx shadcn@latest init`) against existing Tailwind v4 config
- [ ] Install shadcn primitives: `card`, `badge`, `separator`, `avatar` — namespaced under `components/ui/shadcn/` to avoid collisions with existing hand-rolled `Badge`/`Avatar`
- [ ] Create `components/asistente/AssistantCardMessage.tsx` — renders `render_card` output using shadcn card/badge
- [ ] Create `components/asistente/AssistantStatGridMessage.tsx` — renders `render_stat_grid` output using shadcn card/badge
- [ ] Create `components/asistente/AssistantListMessage.tsx` — renders `render_list` output using shadcn card/separator
- [ ] Update `AssistantChat.tsx` — add `tool-render_card` / `tool-render_stat_grid` / `tool-render_list` cases with streaming placeholder pattern

### Infrastructure
- [ ] `components.json` created by shadcn init (committed to repo)
- [ ] CVA, clsx, tailwind-merge, @radix-ui/* peer deps added to package.json

## Done Definition
- shadcn/ui initialized, primitives installed under `components/ui/shadcn/`, no existing components broken
- All 3 tools registered in `lib/assistant/tools.ts` with correct schemas and no-op execute
- `lib/assistant/prompt.ts` includes guidance for card/stat_grid/list selection
- `AssistantChat.tsx` renders all 3 widget types from tool output with streaming placeholder
- Widget visual weight matches existing `AssistantChartMessage` (border/shadow/max-width)
- All tool schema tests pass; ASSISTANT_TOOLS assertions updated
- Existing `render_chart` behavior unchanged

## Parallel work
- Setup (shadcn init + primitives) must land first
- The 3 widget tool+component pairs (card, stat_grid, list) are independent of each other — can run in parallel once setup lands
- Entirely independent of Phase 7 (TanStack Table) — no shared files

## Phase dependencies
- Requires: none (builds on existing assistant pattern from Phase 5)
- Independent of Phase 7

## Complexity
- Backend: S (3 no-op tool definitions + prompt line + tests)
- Frontend: M (shadcn setup + 3 new components + AssistantChat wiring)
- Infra: S (shadcn init + peer deps)

## Risks
- shadcn/ui init against Tailwind v4 may require config adjustments — shadcn's v4 support is newer and may need manual tweaks to `components.json`
- Namespace collision between existing `Badge`/`Avatar` and shadcn versions — mitigated by `components/ui/shadcn/` path convention, but imports must be careful
- Widget visual consistency with existing chat messages needs manual alignment (no design system to reference)
