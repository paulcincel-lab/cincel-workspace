# 0004 — The Estilo replaces the Tablero / Lista / Calendario view switch

- **Status:** Accepted (2026-11-09)
- **Related:** [Estilos milestones](../phases/estilos-milestones.md), [0005](0005-per-style-widget-kit.md), [0006](0006-mock-elements-without-data.md); design canvas https://claude.ai/artifact/8mqoiJjMQr6ZCMXG1ZjhKG

## Context

The redesign added three presentation styles (Visual, Esencial, Analítico), switched by `EstiloSwitch` and stored in the appearance store. Pages also kept their own view controls:
- Tareas had a `Vista` segmented control (Tablero, Lista, Calendario) driven by `?vista=`.
- Personas had `PersonasViewToggle`.
- Dashboards had a chart/table pick per widget.

So one screen could combine a style and a view, which gave nine combinations on Tareas. The mocks showed the overlap: the board, the list and the calendar each needed a Visual, an Esencial and an Analítico version, and several of those combinations looked almost the same.

There was a further problem with the first mocks. Visual grouped by project and looked light, which is the job Esencial is meant to do.

## Decision

The Estilo is the only layout choice, and each page has exactly one layout per style.

| Style | Role | Tareas example |
|---|---|---|
| **Visual** | Heavily visual and product-team oriented: boards, charts, motion | Team kanban with KPI sparklines, a status donut and a week strip |
| **Esencial** | A notably lighter version: soft cards, dots, tinted pills, one or two numbers per group, no tables | One card per project with the signed-in user's tasks, with the status at the end of each row |
| **Analítico** | All data in tables grouped by domain, with a KPI strip and one filter card | Tables grouped project → tramo, with totals and heat cells |

How this applies:

- **Theme:** the default stays Azul Cincel (`THEME_PRESETS.azul`).
- **Quick-add:** writing on the last line of a list, card or board column creates a task (#984).
- **Tareas:** `?vista=` is removed. Old links redirect: `tablero` → `?estilo=visual`, `lista` → `?estilo=analitico`, `calendario` → the page without the param.
- **Calendar:** the Tareas Calendario view is removed. The calendar feed and the agenda widgets stay.
- **Personas:** `PersonasViewToggle` is removed.
- **Proyectos:** the per-widget chart/table toggles on the Proyectos list are removed. Elsewhere the dashboard widget `view` pick is unchanged.
- **Settings and forms:** settings pages and forms ignore the style and keep one layout.

## Consequences

- Every page needs three layouts. The work is tracked in milestones #74–#84 (issues #979–#1017).
- Fewer combinations to build and test: at most three layouts per page.
- Users who relied on the month calendar inside Tareas lose it. It can come back later as its own page.
- The style is a user preference. A link that needs a specific layout uses `?estilo=`.
