# Phase 12: shadcn Form Primitives

## Goal
Install the five missing shadcn form primitives (`Button`, `Input`, `Select`, `Textarea`, `Label`) under `components/ui/shadcn/`, following the established base-ui + cva + cn() pattern, so that subsequent migration phases can swap raw HTML elements for these components.

## Deliverables

### Frontend
- [ ] Add `components/ui/shadcn/button.tsx` — styled `<button>` with cva variants (default, secondary, outline, ghost, destructive, link) and sizes (sm, default, lg, icon), using `useRender`/`mergeProps` for polymorphic rendering (same pattern as `badge.tsx`)
- [ ] Add `components/ui/shadcn/input.tsx` — styled wrapper around `@base-ui/react/input` Root, with cva for size variants and cn() for className merging
- [ ] Add `components/ui/shadcn/select.tsx` — built on `@base-ui/react/select` (Root, Trigger, Value, Icon, Portal, Positioner, Popup, List, Item, ItemText, ItemIndicator, Group, GroupLabel), styled with Tailwind classes matching the existing shadcn aesthetic
- [ ] Add `components/ui/shadcn/textarea.tsx` — styled native `<textarea>` with cva (no headless primitive needed), using `useRender`/`mergeProps` for consistency
- [ ] Add `components/ui/shadcn/label.tsx` — built on `@base-ui/react/field` Label part, or a simple styled `<label>` with cva if the Field primitive is not needed standalone
- [ ] Verify all five primitives export correctly and `npm run build` passes
- [ ] Add a brief Storybook-style smoke test or visual check that each primitive renders with each variant

### Backend
- None (pure UI work)

### Infrastructure
- None

## Done Definition
- All five files exist under `components/ui/shadcn/` and export named components
- Each component follows the established pattern: cva for variants, cn() for className merging, `useRender`/`mergeProps` where applicable
- Button supports at minimum: variant (default/secondary/outline/ghost/destructive/link), size (sm/default/lg/icon), disabled state, asChild-style rendering via `render` prop
- Input supports: type, placeholder, disabled, className passthrough, ref forwarding
- Select supports: single-select with items, placeholder, disabled, value/onChange controlled mode
- Textarea supports: rows, placeholder, disabled, className passthrough, ref forwarding
- Label supports: htmlFor, className passthrough
- `npm run build` passes with zero errors
- No existing components are modified in this phase

## Parallel work
- All five primitives are independent of each other and can be built in parallel
- No backend coordination needed

## Phase dependencies
- Requires: Phase 11 (completed — establishes the shadcn/base-ui pattern and directory structure)

## Complexity
- Backend: None
- Frontend: M (5 components, but each follows an established pattern; Select is the most involved due to base-ui's multi-part API)
- Infra: None

## Risks
- `@base-ui/react/select` has a multi-part composable API (Root/Trigger/Value/Portal/Positioner/Popup/List/Item etc.) — the shadcn wrapper must expose a simple `<Select>` + `<SelectItem>` API while keeping the underlying parts accessible for advanced usage
- `@base-ui/react/input` may differ from expectations if its API has changed between versions — verify the installed version's exports before building
- Button's `useRender` polymorphic pattern must work correctly with both `<button>` and `<a>` tags (for link-styled buttons that navigate)
