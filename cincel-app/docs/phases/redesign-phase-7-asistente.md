# Redesign Phase 7: Asistente en todas partes

## Goal
The assistant opens on every staff page (⌘J) aware of the current project, task or person, keeps threads on the server, offers the 65 new tools only when their backing actions are implemented, and asks for confirmation through native AI SDK approvals before acting toward others.

## Deliverables

### Backend
- [ ] `app/api/asistente/chat/route.ts`: body `{ id, message?, approvals?, context }`; thread upsert by client id (another owner → 403), history loaded from the DB (client history ignored), context ids resolved through viewer-scoped reads, `needsApproval` round trip, dynamic approval after untrusted content (Gmail, documents, attachments), `assistant_actions` audit, JSON log `assistant.action` (BE §7.9, §8.10, §10.1)
- [ ] `lib/assistant/{approvals,threads}.ts` and `assistant-actions.ts`: threads list / read / delete, `importLegacyAssistantThreadAction` (no model call), `fetchAssistantActionsAction`; housekeeping of 50 threads stays in `daily-digest` (BE §7.9, §13)
- [ ] Tool domain files `lib/assistant/tools/<domain>.ts` for all 65 new tools, each with capability, `confirm`, `summarize(input)` and `available(ctx)` reading the flags modules (Rule 3): Consulta y búsqueda (4), Tareas (6), Agenda y calendario (6; event writes registered disabled), Notificaciones y recordatorios (7), Correo / Gmail (5), Mi espacio y jornada (6), Personas, clientes y proveedores (5), Herramientas de arquitectura (8, `lib/assistant/calc/takeoff.ts`), Widgets de respuesta (3), Cutto (15, absent without `CUTTO_API_URL`) (BE §10.2, §10.3)
- [ ] Confirmed shared-entity writes logged in `history_events` "vía asistente"; destructive actions archive (BE §9.9)
- [ ] `assistant-actions.flags.ts` flipped (Rule 1)
- [ ] Tests: `needsApproval` for every Confirmar tool, dynamic approval, capability gating, Cutto and calendar-write tools absent, approval audit per `toolCallId`, thread ownership, legacy import without model call, chat route round trip (BE §16)

### Frontend
- [ ] `AssistantButton` (48 px pill, ⌘J, hidden on `/asistente`) and `AssistantSheet` (extends `AssistantChat` in a `Sheet`): context chip only for server-confirmed context, Historial, Pantalla completa → `/asistente?thread=<id>`, quick actions, composer; client thread id; sends only the new message or approvals; `ConfirmationCard` from `approval-requested` parts (FE §3.9, §4.9)
- [ ] `AssistantContext` from the route (`/proyectos/[id]*`, `/tareas?tarea=`, `/personas/equipo/[id]`, `route`) (FE §3.9)
- [ ] `/asistente` full page: history grouped Hoy / Esta semana / Anteriores with delete, conversation, "Herramientas" panel of starter prompts, legacy localStorage thread imported once and the key deleted; nav item `asistente.ts` (FE §3.9, §21.1)
- [ ] Existing `AssistantChartMessage`, `AssistantCardMessage`, `AssistantStatGridMessage`, `AssistantListMessage` migrated onto `DistributionWidget` / `WidgetCard` / `KpiWidget` / `AttentionListWidget` (FE §4.11.1)
- [ ] Vitest + a11y: `AssistantSheet` context chip, approval states (requested / available / denied / error), thread id and new-message-only, legacy import once (FE §17)
- [ ] Playwright: assistant opens on three pages with the right context and a confirm-required tool shows the card; run locally, result on the issue (FE §17)

### Infrastructure
- [ ] `CUTTO_API_URL` / `CUTTO_API_TOKEN` documented as unset (Cutto tools stay absent until Q1 is answered) (BE §14)

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- `Asistente` (sheet), `AsistentePagina`
- `AsistenteWidgets` (existing widgets migrated; `render_table`, `render_timeline`, confirmation card came in Phase 1)
- `AsistenteHerramientas` (tool catalog and Herramientas panel; the Cutto group is drawn but stays disabled)
- No data view of brief decision 3 in this phase; widgets inside messages follow the user's style through the library
- Not implemented: `InicioCutto`, `CuttoLlamada` and the sidebar open-mic dock

## Done Definition
- The assistant button is on every staff page except `/asistente`, shows the current entity in its chip only when the server confirms it (FE §18 item 10)
- A confirm-required tool shows `ConfirmationCard`; after Confirmar the model receives the result in the same conversation, after Cancelar the denial (FE §18 item 20; BE §17 item 11)
- A tool whose backing action is still a stub (its `IMPLEMENTED` flag false) is not offered to the model; Cutto and calendar-write tools are absent by default (Rule 3; BE §17 item 11)
- Assistant reads never return admin tasks or client/origin data without `canSeeAdminData` (BE §17 item 13)
- Threads persist server-side per user with client-generated ids; another user's thread id → 403
- Flag off: `/asistente` renders as today (outside `AppShell`) with the legacy chat
- Axe clean on the sheet and the full page in all three themes, light and dark (FE §18 item 13)
- Playwright run recorded; Vitest green in the existing CI

## Parallel work
- BE: chat route ∥ assistant actions ∥ one PR per tool group (8 groups) — tool groups only need `defineTool` and the flags modules from Phase 1
- FE: AssistantButton + Sheet ∥ full page ∥ widget migration
- Runs alongside Phases 2–6 and 8 (Rule 2); tools light up as the other phases flip their flags

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: XL
- Frontend: M
- Infra: S

## Risks
- 65 tools is a lot of surface; each group PR must ship with its own capability and approval tests
- Prompt injection through Gmail and documents: the untrusted-content approval rule is the main defence; test it explicitly
- Architecture tools that read files need a provider with image input; return "no disponible" otherwise
- `calendar.events` grant is out of scope, so agenda write tools stay disabled and explain it (FE §3.9)
