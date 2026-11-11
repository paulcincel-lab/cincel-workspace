# 0007 — Calendar changes from the asistente are stored proposals, applied and undone by id

- **Status:** Proposed (2026-11-11)
- **Related:** [Calendario backend spec](../specs/calendario/backend.md) §5–§6, [frontend spec](../specs/calendario/frontend.md) §7, [Calendario milestones](../phases/calendario-milestones.md), #1055 (tool registry rules), #1056 (superseded); design canvas https://claude.ai/artifact/UxWfCgR5P3WKbmuhADXXZr (note "Regla común")

## Context

The Calendario design makes the calendar the place where the asistente plans: "Pasa lo vencido al jueves", "Reparte esto", "Resolver traslape", "Crear 4 tareas en Madrid 22", "Planear mi semana". The canvas fixes one rule for all of them: **the asistente never changes data on its own**. Each change is first shown as a proposal (dashed blue on the grid, originals greyed and struck, or a soft card, or a table with checkboxes), then Aplicar / Cancelar, then Deshacer.

What the code has today does not cover this:
- Write tools (`defineTool` with `confirm: true`) ask through the AI SDK approval flow. `ConfirmationCard` confirms or cancels **all** rows of a group together. There are no per-row checkboxes and no undo for assistant writes (`lib/assistant/approvals.ts`, `components/asistente/ConfirmationCard.tsx`).
- An approval lives only inside a chat message. The calendar grid, the Barra para pedir, the Resumen tiles and Planear mi semana are not chat transcripts, but they need to draw the same proposal and apply it.
- Undo exists only as client-side reverse patches (`undoPatches` in `components/tareas/task-bulk.ts`, toast with `UNDO_LABEL` for `UNDO_MS = 5000`). That works for one user action on rows already in the cache. It does not work for changes that create a meeting with a Google event, create tasks from a minuta, or notify owners.
- `bulkUpdateTasksAction(ids, patch)` writes **one** patch to many tasks. Proposals move each task to its own date.

Options considered:
1. **Approval cards only** (extend `ConfirmationCard` with checkboxes). The grid cannot draw a proposal that only exists inside a chat message part, and the Barra, Resumen and Planear have no chat. Rejected.
2. **Client-only proposals** (the tool returns changes, the page keeps them in a store, Aplicar calls existing actions, undo uses reverse patches). Simple, but a proposal from the chat panel and the same proposal on the grid would be two copies; permissions and stale data are only checked at apply time; undo of created meetings and tasks would need ad-hoc code per kind; nothing is audited.
3. **Stored proposals** with one apply and one undo path. Chosen.

## Decision

1. **A proposal is a row.** Every proposing tool (`move_tasks`, `create_event`, `update_event`, `cancel_event`, `propose_from_text`, `propose_redistribution`, `resolve_overlap`, `plan_week`, `extract_minutes`) writes one `assistant_proposals` row and returns `{ proposalId, kind, title, line, changes }`. It never touches tasks, events or minutes. Each change has a stable `changeId`, the target entity, `before` (read at proposal time) and `after`.
2. **Proposing tools are not writes.** They are registered with `write: false, confirm: false`: storing a draft for the viewer changes no shared data. They still get a step label, a summary and an entry in `TOOL_INVALIDATIONS` (`qk.calendario.proposals()`), so the #1055 guards hold.
3. **One write tool applies.** `apply_proposal({ proposalId, changeIds? })` is the only tool that changes calendar data (`write: true, confirm: true`). In the chat it shows the confirmation card; on the page, Aplicar is the explicit confirmation and calls `applyProposalAction`, the same function. `create_tasks_from_minutes` is a named wrapper over it for the minuta kind.
4. **Apply is per change and partial.** Each checked change is re-checked with the same permission as the single-entity action (task visibility and date permission as in `bulkUpdateTasksAction`, event organizer, project membership). A change whose entity moved since the proposal (`before` no longer matches) or the viewer can't change is skipped with a reason. The result is `ActionResult<ApplyProposalResult>` with `applied`, `skipped` and an `undoToken`. Task date changes are grouped by target date and written through `bulkUpdateTasksAction` (one call per date).
5. **Undo is by token, server-side.** `undo_proposal({ undoToken })` / `undoProposalAction` restores each applied change if its current value still equals what was applied; otherwise it skips it ("Cambió después de aplicar"). Created meetings are cancelled (Google event deleted with `sendUpdates: "all"`), created tasks are soft-deleted with the existing delete path, notifications already sent are not recalled (the toast says so). The token is valid for 15 minutes; the toast offers Deshacer for 10 s, and the chat card keeps a Deshacer button while the token is valid.
6. **The overlay reads the row.** The page draws the open proposal from `qk.calendario.proposal(id)`; the Zustand store only holds which proposal is open and which rows are checked. Cancelar sets the row to `cancelada`. A proposal expires after 24 h or when its range is no longer visible and another one opens.
7. **Audit.** `assistant_proposals` keeps the lifecycle (`propuesta → aplicada | parcial | cancelada | expirada → deshecha`). Applied changes also write the usual `history_events` through the existing actions, with `recordViaAsistente` for the "vía asistente" mark.

## Consequences

- Every planning feature (phases 3–7) shares one representation, one overlay component and one apply/undo path; a new kind is a new `ProposalChange` variant plus its apply/undo handler.
- The confirmation card for `apply_proposal` gets per-row checkboxes (it passes `changeIds`), which the Analítico style also uses as its table.
- `create_event`, `update_event` and `cancel_event` change meaning: they now propose instead of writing after approval. `schedule_site_visit` and `reschedule_task` keep their direct confirm flow outside Calendario.
- One more table and a 15-minute window during which undo is reliable. After that, changes are reverted by hand like any other edit.
- Applying is not one transaction across Google and Postgres. Google calls run after the DB writes commit; a Google failure leaves the Cincel change and marks the event `sync_error`, shown in the detail ("No se pudo actualizar Google Calendar").
