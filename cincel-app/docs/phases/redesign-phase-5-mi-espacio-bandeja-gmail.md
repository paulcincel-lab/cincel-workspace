# Redesign Phase 5: Mi espacio, Bandeja y Gmail

## Goal
Every staff member has a private Mi espacio with quick capture, notes, checklists and natural-language reminders that fire within a minute, and a Bandeja that merges Cincel notifications with their Gmail (read, link, task, draft, confirmed send), plus Ajustes › Notificaciones and Integraciones.

## Deliverables

### Backend
- [ ] `lib/actions/notifications-actions.ts`: `fetchNotificationsAction` (cursor, `unreadCount`), `markNotificationsReadAction`, `fetchNotificationPreferencesAction`, `updateNotificationPreferencesAction` (BE §7.4)
- [ ] `lib/actions/my-space-actions.ts` notes and checklists on `ownerScoped` (create / update / archive / restore notes; checklists, items, toggle, reorder with `lockForUpdate`, archive) (BE §7.5, §8.0.3)
- [ ] Reminders: `lib/my-space/reminder-parser.ts` (every row of BE §8.4), `lib/my-space/reminders.ts`, `parseReminderTextAction`, `createReminderAction` (`PAST_TIME`), `snoozeReminderAction`, `cancelReminderAction`, `fetchRemindersAction`; cron job `reminders-fire` (in-app + `recordatorio` email via `notify`, repeat advancement) (BE §7.5, §8.4, §8.5, §13)
- [ ] Gmail consent: `GET /api/auth/google/start?grant=gmail` (`gmail.readonly` + `gmail.compose`, incremental), callback; `lib/gmail/{client,sync,suggest,sanitize}.ts`; first sync in `after()`; cron job `gmail-sync` (`GMAIL_SYNC_MAX_PER_TICK`, backoff) (BE §7.6, §8.6, §11.1, §13)
- [ ] `lib/actions/gmail-actions.ts`: status, threads, live thread read (sanitized HTML), `syncGmailAction` (`RATE_LIMITED`), link to project (history comment), create task from thread, drafts updated in place by `draftId` returning `confirmToken`, `sendGmailDraftAction` (`CONFIRM_REQUIRED`, `EXPIRED`), `disconnectGmailAction` (cache deleted, token untouched); route `GET /api/gmail/attachments/[messageId]/[attachmentId]` (BE §7.6)
- [ ] Flags flipped: `notifications-actions.flags.ts`, `my-space-actions.flags.ts`, `gmail-actions.flags.ts` (Rule 1)
- [ ] Tests: parser table, repeat advancement, owner-scoped suite instances, sanitizer allowlist, project suggestion, draft reuse, disconnect, acceptance "reminder → tick → in-app row + email" (BE §16)

### Frontend
- [ ] `/mi-espacio` (RSC + `MiEspacioClient`): header with "Solo tú lo ves", `QuickCapture` routing (checklist / reminder / note), right column, `?nota=<id>`; nav item `mi-espacio.ts` with unread badge; Bandeja badge sidebar slot loader (FE §3.3, §21.1)
- [ ] `Inbox` (Bandeja): tabs Todo / Gmail / Notificaciones / Menciones with counts, rows, mark read on open, 60 s poll while visible updating the sidebar badge, Gmail status chip (FE §3.3, §6)
- [ ] `GmailReader` (sandboxed `<iframe srcdoc>`, remote images blocked with "Mostrar imágenes", attachment links) and `GmailDraftSheet` on `FormSheet` (saves pass `draftId`; "Enviar" → `FormDialog` "¿Enviar este correo a {destinatarios}?"; re-save on `EXPIRED`); "Crear tarea", "Vincular a proyecto" with the bitácora note (FE §3.3)
- [ ] Notes: `NotesGrid` (instance of `EntityCardGrid`, tints by color) and `NoteEditor` on `FormSheet` (toolbar, swatches, pin, "Convertir en tarea"); archive with "Deshacer" toast (FE §3.3)
- [ ] Reminders list (Posponer 1 h / Mañana / Cancelar) and `ReminderDialog` on `FormDialog` with the parsed preview chip (FE §3.3)
- [ ] `ChecklistCard` reusing the task checklist rows; add item, toggle with rollback (FE §3.3)
- [ ] Ajustes › Notificaciones: kind × channel matrix, quiet hours, "Resumen diario a las 07:30"; settings section files under `lib/shell/settings-sections/notificaciones/` (FE §3.8)
- [ ] Ajustes › Integraciones: Gmail card (Conectar, Sincronizar ahora, Desconectar dialog with copy and "Abrir permisos de Google"), Google Calendar, Drive, Cutto link-only card, monday link (FE §3.8)
- [ ] Vitest + a11y: `Inbox`, `GmailReader`, `GmailDraftSheet` (send requires the dialog), `NoteEditor`, `ReminderDialog` (`PAST_TIME`), `ChecklistCard`, `QuickCapture` routing, disconnect copy (FE §17)
- [ ] Playwright: note / checklist / reminder flow with the reminder firing via a test call to `/api/cron/tick`; run locally, result on the issue (FE §17)

### Infrastructure
- [ ] Gmail API enabled on the Google Cloud project; `gmail.readonly` and `gmail.compose` added to the OAuth consent screen of the staff client; `GMAIL_SYNC_MAX_PER_TICK` documented (BE §11.1, §14)

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- `MiEspacio`, `MiEspacioEsencial`, `MiEspacioAnalitico`
- `MiEspacioGmail` (reading pane), `NotaEditor`, `NuevoRecordatorio`
- `AjustesNotificaciones` (without the "Cutto" column, RD-9), `AjustesIntegraciones`
- Mobile content: `MovilMiEspacio`
- Not implemented: `InicioCutto`, `CuttoLlamada`

## Done Definition
- Mi espacio renders Visual, Esencial and Analítico from the same data; guard test green (FE §18 items 4 and 15)
- Notes create / edit / archive with undo, checklists toggle, reminders from natural text; a reminder due now appears in Bandeja within one minute and its email is sent by `notifications-deliver` (FE §18 item 7; BE §17 item 4)
- Gmail: connect, list, open, link to a project, create a task, draft a reply; sending only after the confirmation dialog with a valid token; disconnect clears the cache and keeps Drive / Calendar working (FE §18 item 8; BE §17 item 10)
- Every Mi espacio, Gmail and notification action returns or changes only the caller's rows (BE §17 item 3)
- Flag off: `/mi-espacio` redirects to legacy and nothing changes; flag on: Mi espacio nav item with unread badge appears
- Axe clean on Mi espacio, reader, editors and both Ajustes pages in all three themes, light and dark (FE §18 item 13)
- Playwright run recorded; Vitest green in the existing CI

## Parallel work
- BE: notifications ∥ notes + checklists ∥ reminders + `reminders-fire` ∥ Gmail consent + sync ∥ Gmail actions + attachments (actions code against the Phase 1 `gmail_*` tables)
- FE tracks: page + QuickCapture ∥ Bandeja ∥ Gmail reader + draft ∥ notes ∥ reminders ∥ checklists ∥ Ajustes Notificaciones ∥ Ajustes Integraciones
- INFRA Gmail scopes in parallel with all of it (needed only for the live e2e)
- Runs alongside Phases 2–4 and 6–8 (Rule 2)

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: XL
- Frontend: L
- Infra: S

## Risks
- Gmail restricted scopes may require Google verification for an external app; confirm the OAuth client is internal to the Workspace domain before building on it
- Rendering mail HTML is a security surface: sandboxed iframe + server sanitizer, remote images off by default; review the allowlist
- Reminder timing depends on the host cron calling the tick every minute (Phase 1 INFRA); verify on production after deploy
- The 60 s Bandeja poll adds load per open tab; keep it visibility-gated
