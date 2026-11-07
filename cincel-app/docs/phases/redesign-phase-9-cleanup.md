# Redesign Phase 9: Cleanup

## Goal
The redesign is the only UI: the `ui.redesign` flag, the legacy shell, the conditional branches of the redirect stubs, the replaced components and the localStorage readers are gone, and `globals.css` falls back to Azul.

## Deliverables

### Backend
- [ ] `appearance.primary_color` no longer read; the key deleted from `app_settings` (BE §3.12, D2)
- [ ] Legacy pipeline reads (`getPrimaryColor`) removed from server code

### Frontend
- [ ] Flag removed: `resolveAppearance` stops reading `redesignEnabled` / `redesignAvailable` for rendering; `app/(staff)/layout.tsx` always renders `AppShell`; `LegacyFrame` deleted; opt-in banner, legacy menu entry, "Volver al diseño anterior" and the Apariencia "Nuevo diseño" switch removed (FE §2.3)
- [ ] Redirect stubs keep redirecting, without their flag-off branch; new-only routes stop redirecting to legacy (FE §2.3)
- [ ] Legacy shell deleted: `components/layout/Sidebar.tsx`, `Header.tsx`, `ThemeToggle.tsx` and its `data-theme` legacy, the `<style id="primary-color">` injection (BE §21)
- [ ] Every component marked extends / replaces / evolves in the reuse ledger whose old version is still present is deleted (e.g. `TaskDrawer`, `NewTaskModal`, `app/dashboard/DonutCard.tsx`, `MemberProfileModal` content, `ProjectCreateModal`) (FE §4.11.1, §18 item 16)
- [ ] `globals.css` fallback regenerated from `THEME_PRESETS.azul` with `npm run themes:css`; drift guard switched from "unchanged from today" to "equals Azul" (BE §16)
- [ ] localStorage readers deleted: `cincel.theme`, profile photo, header links, `cincel.asistente.thread.v1` (FE RD-12)
- [ ] Vitest and Playwright updated for the flagless app; run locally, result on the issue

### Infrastructure
- [ ] None

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- No new frames. Spot-check every frame implemented in Phases 1–8 after the fallback switch (first paint without the appearance block must match `Dashboard` in Azul)
- Not implemented: `InicioCutto`, `CuttoLlamada`, `AjustesWorkflows`

## Done Definition
- `rg "redesignEnabled|LegacyFrame|ThemeToggle|primary-color|components/layout/(Sidebar|Header)"` finds nothing outside migrations and changelog
- Every old route of FE §2.2 still redirects (query preserved) for every user; every route of FE §2.1 renders inside `AppShell` with one header (FE §18 item 1)
- Guard test and flags check still green; no `IMPLEMENTED` entry is false
- `app/globals.css` token block equals `THEME_PRESETS.azul` (drift guard)
- Axe clean on every page in all three themes, light and dark (FE §18 item 13); full Playwright suite run locally and recorded
- Vitest, typecheck and lint green in the existing CI

## Parallel work
- FE: flag removal ∥ legacy component deletions ∥ `globals.css` regeneration ∥ localStorage readers
- BE: `primary_color` removal alongside

## Phase dependencies
- Requires: Phases 1–8 merged and the organization switched to the new design (`redesignDefault = true`) for at least one release
- Unblocks: none

## Complexity
- Backend: S
- Frontend: M
- Infra: S

## Risks
- Deleting legacy components may break pages not yet moved; run the full e2e suite before merging
- Dropping the `user_preferences.redesign_enabled` column is not asked by the specs; leave it (no migration in this phase) unless the user decides otherwise
- Users who never opened the new design lose their localStorage theme; acceptable, the org theme applies
