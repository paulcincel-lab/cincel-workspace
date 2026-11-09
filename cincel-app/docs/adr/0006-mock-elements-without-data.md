# 0006 — Mock elements without a data source

- **Status:** Proposed (2026-11-09). The defaults below are in the issues; the product owner may change any of them.
- **Related:** [0004](0004-estilo-replaces-view-switch.md), [Estilos milestones](../phases/estilos-milestones.md)

## Context

The Estilos mocks were drawn ahead of the data model. Writing the issues against the code turned up elements with no data behind them:

- **Load is counted in tasks.** "Carga" means open tasks ÷ `staff.capacity`, and `staff.capacity` is a number of tasks. Tasks have no hour estimates. `time_entries` records clock in and out with no project attached.
- **Fases have no dates.** Schedule tasks are keyed by section, not by fase or tramo.
- **Missing tracking.** Drive files have no stored size. Document opens are not recorded, and template use is not tracked.
- **Missing portal data.** The portal has no per-tramo progress, no actual start or finish dates, and no progress history.
- **Missing Asistente data.** Tool parts carry no timestamps, and only `parts` is saved for each message.
- **Staff names in the portal.** The portal mocks show staff names ("Tu equipo Cincel", "Subido por"). The portal never sends staff data today.

## Decision

1. **Small derivations ship with the page.** When the data exists and only a small server read or aggregation is missing, the page issue adds it. Examples: the Tareas summary per project → tramo, `teamLoad`, and the trend series. Where two issues need the same new data, one of them is named as its owner.
2. **New schema ships with its issue.** When an element needs a new column or table, the issue includes the migration. Examples: `assistant_messages.metadata`, `resource_links.project_id`, `resource_link_opens`, `schedule_tasks.started_on` / `finished_on`, `positions.weekly_capacity_hours`, `workflows.color_slot`.
3. **No data, no element.** When the source is missing or still undecided, the element is hidden. It is never drawn with zeros or placeholder data. Examples: storage quota, template use, Real / Desvío, hours by project.
4. **Copy follows the data.** Load is described in tasks, not hours.
5. **The portal sends only client-safe fields.** The default team list is name and role, with email only for the manager. Uploads show "Tú" or "Cincel". The portal DTO allow-list is written out in #1011 and #1013.
6. **Undecided rules get a default.** Each issue states a default for any rule nobody has decided yet, for example "en riesgo", "Atrasados vs plan" and the load thresholds. The open ones are listed in the milestone reference.

## Consequences

- About half of the page issues carry the `backend` label, and several of them include migrations. Cincel is dev-only, so these need no production backup steps.
- Some frames will look emptier than their mocks until the hidden elements get a data source.
- Each default stays in force until the product owner decides otherwise. Changing one later is a small, local change.
