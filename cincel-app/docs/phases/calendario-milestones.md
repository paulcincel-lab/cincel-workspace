# Calendario: the calendar page and planning with the asistente

Reference for GitHub milestones **#87–#95** ("Calendario Phase 0" to "Calendario Phase 8") and issues **#1059–#1095**, created 2026-11-11 (#1094 and #1095 added the same day after the UI coverage review). Supersedes #1056; the new tools follow #1055 (PR #1057).

- **Specs:** [frontend](../specs/calendario/frontend.md), [backend](../specs/calendario/backend.md).
- **Decision:** [ADR 0007](../adr/0007-calendar-proposals-and-undo.md): asistente changes are stored proposals, applied and undone by id.
- **Design canvas:** https://claude.ai/artifact/UxWfCgR5P3WKbmuhADXXZr. Boards: `Main` (Visual), `Esencial`, `Analitico`, `Asistente`, `Sidebar`, `P1-Barra`, `P2-Resumen`, `P3-Alertas`, `P4-Reunion`, `P5-Planear`. Boards named `Artboard-…` are not part of the design.
- **Rule for every feature:** the asistente never changes data on its own. A change is a proposal first (dashed on the calendar, a soft card, or a table with checkboxes), then Aplicar / Cancelar, then Deshacer. Every ✦ action maps to a registered tool.

## Delivery model

- **Contracts first:** Phase 0 is one issue that lands the schema (one generated migration), the types, typed stubs for every loader, action and tool, the query keys and options, the UI store and the widget stubs. Every other issue codes against those names and lists them under "Consumes".
- **No blocking order after Phase 0:** issues of phases 1–7 can be coded at the same time against the stubs. Where two issues touch the same name, one owns it (named in its Contract) and the others only consume it.
- **Shared overlay:** Phase 3 owns the proposal overlay and the apply/undo path; phases 4–7 draw their proposals with it.
- **Migrations:** Phase 0 owns all schema. A later phase adds at most one generated migration, only for its indexes or data backfill (backend §4).
- **Cleanup last:** Phase 8 adds the e2e suite and performance budgets and removes code the page no longer imports.

## Issue format

Every issue has: Context · Scope · Contract (Implements / Consumes, with paths and signatures) · Acceptance criteria · Tests · Out of scope · Decision needed (each with a recommended default). Bodies are English; UI copy is Spanish, sentence case.

Shared acceptance criteria for UI issues: tokens only; per-style markup only in `components/widgets/*`; `PageStyleLayout` for the three Estilos; motion off under `prefers-reduced-motion`; no font weight above 600; axe clean in light and dark; 390 px with no horizontal page scroll; Vitest, typecheck, lint and `check-data-patterns` green.

Shared acceptance criteria for backend issues: zod input; `ActionResult` for every user-facing write; viewer-scope and role checks re-run in the action; DB tests as a viewer without access; tools registered with step, summary and invalidation (the #1057 guards).

Labels: `frontend`, `backend`, `ui/ux`, `database`, `accessibility`, `testing`, `performance`, `enhancement` as they apply.

## Milestones and issues

### Phase 0: Contracts (milestone #87)

| Code | Issue | Title |
|---|---|---|
| 0.1 | #1059 | [FE/BE]: Calendario contracts: schema and migration, types, typed stubs, query keys, UI store and tool registry stubs |

### Phase 1: Calendario base (milestone #88)

Goal: the menu item and the page in three Estilos with Día / Semana / Mes, tasks only, filters in the URL, event detail per style for tasks, ICS kept, the asistente knows the visible range.

| Code | Issue | Title |
|---|---|---|
| 1.1 | #1060 | [BE]: Calendario range loader with per-day SQL aggregates, paged list and a load-everything guard |
| 1.2 | #1061 | [FE]: /calendario route, menu item, redirects, prefetch and hydration, toolbar and filters in the URL |
| 1.3 | #1062 | [FE]: Visual: month grid and week columns with drag to reschedule and Deshacer |
| 1.4 | #1063 | [FE]: Visual: day timeline with the now line and "Tareas del día · sin hora" |
| 1.5 | #1064 | [FE]: Esencial: agenda cards by Vencidas / Hoy / Mañana / Esta semana / Resto del mes with one-tap complete |
| 1.6 | #1065 | [FE]: Analítico: KPI strip and table grouped by day and week with the task-table kit and Cargar más |
| 1.7 | #1066 | [FE]: Event detail per Estilo: floating card, bottom sheet and right drawer |
| 1.8 | #1067 | [FE/BE]: Asistente on Calendario: page context, calendar_range tool, suggestions and composer placeholder |

### Phase 2: Meetings (milestone #89)

Goal: meetings created in Cincel and the viewer's Google events on the calendar, with attendees, Meet links and detail actions. **Google Calendar is the main path (D1, decided):** a meeting is written to the organizer's Google Calendar with Meet and Google's invitations; the Cincel-only meeting with an email invitation is only the failure path. Depends on Phase 0; the UI builds on Phase 1's widgets.

| Code | Issue | Title |
|---|---|---|
| 2.1 | #1068 | [BE]: Cincel meetings: calendar_events and attendees repository, create / update / cancel actions, invitations and history |
| 2.2 | #1069 | [BE]: Google Calendar: calendar_events grant, primary calendar cache with sync tokens, write-through with Meet, free/busy |
| 2.3 | #1070 | [BE]: Meetings in the range loader, the ICS feed and the agenda tools |
| 2.4 | #1071 | [FE]: Meetings in the three Estilos, meeting detail actions and the Nueva reunión dialog |
| 2.5 | #1072 | [FE]: Google Calendar connection for meetings: Integraciones row, status line and refresh (also owns the Google state of a meeting in the detail, frontend §6.2) |
| 2.6 | #1094 | [FE]: Meetings outside the calendar: Inicio agenda, Bandeja and Ajustes › Notificaciones for the reunion kind |

### Phase 3: Barra para pedir and the proposal overlay (milestone #90)

Goal: the shared proposal model (ADR 0007), its overlay in every view, apply with partial permission and undo, and the Barra para pedir. Phases 4–7 reuse all of it.

| Code | Issue | Title |
|---|---|---|
| 3.1 | #1073 | [BE]: Proposals: assistant_proposals, apply_proposal and undo_proposal with partial permission and an undo token |
| 3.2 | #1074 | [BE]: Proposing tools: move_tasks, create_event / update_event / cancel_event as proposals, and propose_from_text |
| 3.3 | #1075 | [FE]: Proposal overlay in every view and Estilo: dashed proposals, struck originals, checkbox table, Aplicar / Cancelar / Deshacer |
| 3.4 | #1076 | [FE]: Barra para pedir in the three Estilos with example chips and the proposal card |
| 3.5 | #1077 | [FE]: Asistente confirmation card: per-row checkboxes and Deshacer for apply_proposal |

### Phase 4: Resumen del día / semana (milestone #91)

| Code | Issue | Title |
|---|---|---|
| 4.1 | #1078 | [BE]: summarize_day and summarize_week: risk and blocking rules, lead paragraph and tile actions |
| 4.2 | #1079 | [FE]: Resumen del día / semana in the three Estilos |

### Phase 5: Días que avisan (milestone #92)

| Code | Issue | Title |
|---|---|---|
| 5.1 | #1080 | [BE]: Task estimated hours: column, template default, 1 h fallback, edit action and bulk patch |
| 5.2 | #1081 | [BE]: day_load and find_overloads: planned hours against the workday per person and day, and overlaps |
| 5.3 | #1082 | [BE]: propose_redistribution and resolve_overlap with attendees' free/busy and "Aplicar y avisar" |
| 5.4 | #1083 | [FE]: Días que avisan: day meters, load labels, overload edge, "Se traslapan" and banners in the three Estilos |
| 5.5 | #1084 | [FE]: Estimated hours in the task sheet, the task tables and quick-add |
| 5.6 | #1095 | [FE]: Calendario settings: workday hours in Ajustes › General and Horas estimadas in the Tramos template editor |

### Phase 6: Antes y después de la reunión (milestone #93)

| Code | Issue | Title |
|---|---|---|
| 6.1 | #1085 | [BE]: meeting_prep and send_agenda: project KPIs, summary, overdue items, proposed agenda and email |
| 6.2 | #1086 | [BE]: Minutes: notes, extract_minutes, create_tasks_from_minutes with the follow-up meeting, and send_minutes |
| 6.3 | #1087 | [FE]: Antes de la reunión tab in the three Estilos |
| 6.4 | #1088 | [FE]: Después de la reunión tab and meeting state chips in the three Estilos |

### Phase 7: Planear mi semana (milestone #94)

| Code | Issue | Title |
|---|---|---|
| 7.1 | #1089 | [BE]: plan_week: deterministic capacity placement, deferral reasons, backlog and lanes loader, owner notifications |
| 7.2 | #1090 | [FE]: Planear mi semana: backlog, lanes per person × Lun–Vie, drag with keyboard alternative, three Estilos (a collapsible section of the Semana view, F12; deferred if it is much trouble) |

### Phase 8: Cleanup and polish (milestone #95)

| Code | Issue | Title |
|---|---|---|
| 8.1 | #1091 | [FE/BE]: Calendario e2e suite and eval-style prompt tests for the planning tools |
| 8.2 | #1092 | [FE/BE]: Performance budgets for /calendario and the range loader |
| 8.3 | #1093 | [FE/BE]: Cleanup: remove superseded calendar helpers and old agenda fallbacks, update docs/assistant.md |

## Dependencies

```
Phase 0 ──► every issue (names, schema, stubs)
Phase 1 widgets ──► Phase 2 FE (meetings drawn by the same chips and detail)
#1073 apply/undo + #1075 overlay ──► Phase 4, #1082/#1083, #1086/#1088, Phase 7 proposals
#1069 free/busy ──► #1082 resolve_overlap
#1080 hours ──► #1081 load ──► #1082, #1089
#1068 meetings ──► Phase 6, #1094
#1080 / #1081 settings ──► #1095
```
These are build-order hints for integration; with Phase 0 merged, every issue codes against stubs and is merged in one integration branch, then tested together.

## Decision needed

Every item has a recommended default, so work can start now.

| # | Topic | Issues | Recommended default |
|---|---|---|---|
| D1 | Google scopes `calendar.events` + `calendar.freebusy` (Workspace admin must allow) | #1059, #1068, #1069, #1071, #1072 | **Decided 2026-11-11:** the admin grants both as the incremental grant `calendar_events` (ops step in #690). Write-through and free/busy are the main path; the Cincel-only meeting with email invitation is only the failure path |
| D2 | Cache other people's Google events for "Todos" | #1069, #1070 | No: owner-only; the team view shows Cincel meetings and free/busy only |
| D3 | Workday hours | #1081, #1089 | `positions.weekly_capacity_hours / 5` (highest-capacity position), else org setting `calendario.workday_hours` = 6 |
| D4 | Task duration estimate | #1080 | `tasks.estimated_hours` → `workflow_task_templates.default_estimated_hours` → 1 h |
| D5 | Support (apoyo) tasks in a person's hours | #1081 | 0 h; they count for the manager only |
| D6 | Model use in summaries | #1078, #1085 | Templates on load; the model only rephrases on a ✦ request |
| D7 | `plan_week` reassigns tasks | #1089 | No in v1, dates only |
| D8 | Per-row selection on the chat confirmation card | #1077 | Input override on approval; fallback deny + re-issue with the subset |
| D9 | Undo window | #1073 | 15 min server token; toast 10 s |
| D10 | Load labels | #1081, #1083, #1090 | < 50 % Libre, ≤ 85 % Bien, ≤ 100 % Casi lleno, > 100 % Sobrecargado |
| D11 | Where a task's hours fall | #1081 | All on its due day |
| D12 | Meeting defaults from the asistente | #1074 | 60 min; project manager, coordinator and client contact with email; Meet link when Google is connected |
| D13 | Invitations on the failure path, and when Google comes back | #1068, #1069 | Email (no `.ics`) and in-app at once; the resync (button, cron every 15 min, max 3 tries) creates the Google event with `sendUpdates=none`, so nobody is invited twice |
| F1 | Calendario in mobile bottom tabs | #1061 | No; in "Más" |
| F3 | Default vista per Estilo | #1061 | Visual Mes, Esencial Semana, Analítico Semana |
| F4 | Date set by "+ Tarea para este día" | #1063 | Commitment date |
| F6 | Drag meetings | #1062, #1071 | No in v1 |
| F7 | Analítico Mes grouping | #1065 | One group per ISO week |
| F8 | Google refresh trigger | #1072 | Once per session on mount when older than 5 min, plus "Actualizar" |
| F10 | Keep the Nueva reunión draft across the Google grant redirect | #1071 | Yes: `sessionStorage` draft and `?nueva=reunion` |
| F11 | "Tramos" legend in the shell sidebar (`Sidebar` board) | #1061 | **Decided: not built.** The legend is in the Visual filter row |
| F12 | Where Planear mi semana lives | #1090, #1079 | **Decided:** a collapsible section of the Semana view; left for later if it is much trouble |

`docs/phases/milestones.json` is not updated: like the Estilos milestones (#74–#84), these milestones have no per-phase labels in the repo.

## What shipped

Phases 0-8 are merged (the page, meetings, proposals, summaries, load warnings, meeting prep and minutes, Planear mi semana, settings and the outside-the-calendar screens). The finish pass wired the per-Estilo event detail, the proposal overlay and day meters into Mes, Semana and Día, the Antes / Después tabs, the Resumen, the Reuniones list and the day hours setting; meetings now join the Analítico list; undo retracts minutes decisions and applying a `planear_semana` proposal notifies the other owners. The e2e suite (#1091) is run separately in the browser, not in CI.
