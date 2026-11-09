# Session record: query migration close-out and Estilos planning (2026-11-08 to 2026-11-09)

A summary of what was decided and delivered, not a transcript.

## 1. TanStack Query migration: finished

| PR | Scope | Merged |
|---|---|---|
| #973 | Phase 1: foundation and shared contracts | 2026-11-08 |
| #975 | Pre-phase fixes, closing #974 (`useStyle` reads the appearance store), #946 (schedule payments only for admins), #930 (CI fails when `next build` logs errors) and #932 (`cookies()` outside `after()`) | 2026-11-08 |
| #977 | Phases 2–11: every screen on TanStack Query | 2026-11-08 |
| #978 | Phase 12: dashboard interactions | 2026-11-08 |

A scan of `main` after the merges found no `router.refresh()` outside login and logout. It also found no `createContext` outside shadcn, no window events or polling timers, and `revalidatePath` only in the planned layout cases.

Left open:
- #936: the Mi espacio entry in `lib/shell/nav-prefetch.ts`, the last open migration issue.
- Two empty cache helpers that can be deleted: `revalidateInicioScreen()` (still called from 5 places) and `lib/cache/screens/targets.ts`.
- #931: a few action files still throw without `ActionResult`, mainly the monday import, workspace access and app settings actions.
- The local worktrees from the migration run (`query-migration-batch-1..3`, `-deps`, `-integration`) are merged and clean but have not been removed.

Filed: #976, typecheck once. It sets `typescript.ignoreBuildErrors` in `next.config` and adds a separate `tsc --noEmit` CI job. That saves about 2 minutes per build. CI had only one typecheck, the build's own, so both changes have to land together.

## 2. Design mocks

The mocks were built in the design canvas https://claude.ai/artifact/8mqoiJjMQr6ZCMXG1ZjhKG. The final version has 42 frames in the Azul Cincel theme.

How the direction changed, in order:
1. **Analítico, first ask:** group projects in accordions, and apply the same idea to Tareas with filtering.
2. **Visual stays visual:** the light look belongs in Esencial. Analítico should be dense but structured, grouped project → tramo (fase).
3. **Apply it everywhere:** every Esencial and Analítico page, in the Azul theme.
4. **Smart quick-add:** write on the last line to create a task, with animation and suggestions, and a path to the Asistente.
5. **Views superseded by the Estilo:** Tablero, Lista and Calendario go away. Visual means boards, charts and motion for product teams. Esencial is notably lighter. Analítico is tables grouped by domain. Every page gets all three styles for comparison. → [ADR 0004](../adr/0004-estilo-replaces-view-switch.md)
6. **Fixes:**
   - Tareas Analítico had too many filter UIs, so they became one filter group.
   - Quick-add got a place in Visual and Esencial.
   - Tareas Esencial became one card per project with the user's tasks and the status at the end.
   - Asistente and Ajustes screens were added, including a better display of tool steps.
7. **Coherence pass:** one style across the whole site, because the mocks are the basis for the tickets.
8. **Final adjustments:**
   - Tareas Analítico went back to the earlier non-pill filters, as square segmented groups in one card.
   - The Asistente chat scrolls while the composer stays pinned at the bottom.
   - Every suggestion card got a send icon.
   - A final polish of Asistente Visual.

What the canvas holds:
- **Tareas:** Visual (kanban), Esencial, Analítico (todas and En retraso), and the interactive quick-add frame.
- **Other pages,** in all three styles: Inicio, Proyectos, Proyecto Resumen, Personas, Mi espacio, Biblioteca, Asistente, Portal.
- **Ajustes:** 13 single-layout frames.
- **Removed:** the Lista, Tablero and Calendario variants.

## 3. Tickets

The request was milestones and issues for every change, with no blocking chains: code everything together, then merge and test. The issues should be as detailed as possible, and this pass was issues only.

Created:
- **11 milestones,** #74–#84 ("Estilos Phase 1" to "Estilos Phase 11").
- **39 issues,** #979–#1017: 7 shared building blocks, 31 page issues and 1 cleanup.

Each issue was written against the mock frames and the current code. Each one contains:
- types and file paths;
- measured specs mapped to tokens;
- states and permissions;
- keyboard and ARIA behaviour;
- the exact Spanish copy;
- named tests;
- "Decision needed" items, each with a default.

After the shared issues were expanded, the page issues were brought into line with them: #334155 maps to `foreground-soft`, and `rise`, `glow`, `typing` and `spin` are part of #981.

The reference is [estilos-milestones.md](../phases/estilos-milestones.md).

Writing the issues showed that most of the work is restyling and rearranging existing widgets. About half of the issues also need new data. That policy is recorded in [ADR 0006](../adr/0006-mock-elements-without-data.md), and the shared-kit approach in [ADR 0005](../adr/0005-per-style-widget-kit.md). The largest new pieces of data:
- the Tareas summary per project → tramo;
- trend series on Inicio and Tareas;
- load across projects;
- Biblioteca sizes and open counts;
- portal per-tramo progress and actual dates;
- Asistente step durations;
- a few catalog columns in Ajustes.

## 4. Open decisions

The product owner has not answered these yet. Each one has a default in its issue, and the milestone reference lists them all:
- **Staff names in the portal.**
- **Load unit:** tasks, not hours.
- **Fase plan dates:** where they come from.
- **Base status colors:** the Estatus and Tema frames disagree.
- **"En riesgo" rule** for projects.
- **"Editar" on an Asistente confirmation.**
- **Thresholds:** "Atrasados vs plan" and the load levels.
- **Page title and type scale sizes.**

## 5. Next step

Implement milestones #74–#84 in one run: the contracts issue #979 first, then everything else at the same time, cleanup #1017 last, then merge and test together.
