# 0005 — Pages build their three styles from one shared widget kit

- **Status:** Accepted (2026-11-09)
- **Related:** [0004](0004-estilo-replaces-view-switch.md), [Estilos milestones](../phases/estilos-milestones.md), issues #979–#985

## Context

[0004](0004-estilo-replaces-view-switch.md) gives every page three layouts. Without shared parts, about 30 page layouts would each build their own grouped table, filter bar, cards and animations, and look different from one another. The first round of mocks already had five different filter controls on one page.

The codebase already keeps per-style markup in one place:
- `StyleView` renders one branch per style.
- Guard tests (`components/*/*style-guard.test.ts`, `components/inicio/inicio-guard.test.ts`) only allow it inside `components/widgets/*`.

## Decision

1. **One page entry point.** Pages pick their layout with `PageStyleLayout({ visual, esencial, analitico })` from `components/widgets/`. Pages never import `StyleView` directly, so the guard tests stay as they are.
2. **One shared kit, with names fixed in #979:**
   - Analítico: `GroupedTable` (two levels, totals, heat cells, "Ir a" anchors), `KpiStrip` and `FilterCard`. `FilterCard` is a single card of square segmented groups, never pills.
   - Esencial: `EsencialCard` and `EsencialItemRow`, with the status chip in a fixed column at the end.
   - Visual: motion on the existing charts and cards, and the kanban with `renderColumnFooter` (#985).
   - Every page: `PageHeader`, which carries the Estilo switch.
   - Quick-add: `parseQuickAdd` and `QuickAddRow`.
3. **Tokens and motion only from #981:**
   - Tramo slots 1–4 and the status colors.
   - Tint tokens, `foreground-soft` for #334155, and `destructive-ink` for readable red on red tint.
   - Motion utilities: `anim-in`, `row-new`, `lift`, `draw`, `grow`, `ring`, `rise` with `staggerStyle`, `spin`, `glow` and `typing`. Every one is turned off under `prefers-reduced-motion`.
   - Font weight is capped at 600.
4. **Plain shadcn first.** Where a mock differs from a shadcn size by about 2 px, the shadcn size wins. No color `className` overrides.

## Consequences

- The contract issue (#979) lands first in a parallel implementation run, because every page issue codes against its names. No other issue blocks another.
- Adding a page style means composing kit parts, not writing new table or filter code.
- If a kit part has to change shape later, every page that uses it changes too. Kit props are added as optional fields, never renamed.
