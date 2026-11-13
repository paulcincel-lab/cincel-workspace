# Soporte: solicitudes and the Mejoras view

Reference for GitHub milestones **#96–#100** ("Soporte Phase 0" to "Soporte Phase 4") and issues **#1108–#1120**, created 2026-11-13.

## Goal

Any staff member can report a problem, suggest an improvement or ask a question from any screen in a few seconds, and follow what happens to it. Admins see every request in one place (**Mejoras**), triage it, answer it and, when it becomes product work, publish it to GitHub as an RFC issue whose status flows back to the person who asked.

## Names

- **Solicitud**: one request. Code `SOL-0001`. Kinds: `error` ("Algo falla"), `mejora` ("Una mejora"), `pregunta` ("Una pregunta").
- **Estados**: `nuevo` (Nueva) → `en_revision` (En revisión) → `planeado` (Planeada) → `en_progreso` (En progreso) → `resuelto` (Resuelta), or `descartado` (Descartada, with a public reason; duplicates point to the original).
- **Prioridad** (admins only): `baja`, `media`, `alta`.
- **Reportar o sugerir**: the dialog. **Mis solicitudes**: the user's list in Ajustes › Personal. **Mejoras**: the admin page at `/mejoras`.
- Capability **`canManageSupport`**: Administrador by default, grantable to a puesto in Ajustes › Permisos.

## Decisions (with the default taken)

| # | Decision | Default |
|---|----------|---------|
| S1 | Where solicitudes live | In Cincel's database. The GitHub repository is public, so nothing a user writes goes to GitHub automatically. |
| S2 | Who publishes to GitHub | An admin, from Mejoras, after editing a preview and ticking "Sin nombres de clientes, personas, correos ni datos internos". A redaction helper pre-cleans the text. |
| S3 | Status sync from GitHub | Polling every 30 minutes (cron with the existing lease), no webhook. |
| S4 | Where Mejoras lives | Top-level sidebar item "Mejoras", visible only with `canManageSupport`, with a badge of new solicitudes. |
| S5 | Asistente | New `create_ticket` tool for everyone. `create_rfc` becomes admin-only and goes through the same review and redaction instead of posting directly. |
| S6 | Attachments | Up to 3 images of 5 MB, private storage, served through an authenticated route, EXIF stripped. |
| S7 | Internal notes | Admin messages default to "Nota interna"; a public reply is an explicit choice. |

## Data model (Phase 0)

- `support_tickets`: code, kind, title, description, steps, area (derived from the route), context (path, estilo, tema, viewport, app version, user agent, time), status, priority, author, assignee, duplicate_of, GitHub issue number and URL, last sync, created/updated/closed.
- `support_ticket_events`: one row per change (created, status, priority, assignee, reply, note, published, synced, duplicate), with `visibility` `public | internal`. The author never sees internal events.
- `support_ticket_attachments`: file key, type, size, name.

## Delivery model

Same as Calendario: Phase 0 lands the schema (one generated migration), types, capability, query keys, typed stubs and flags (`SOPORTE_ENABLED`, `MEJORAS_ENABLED`, `SOPORTE_GITHUB_ENABLED`, all off). Phases 1–3 code against the stubs at the same time; each flips its own flag. Phase 4 runs the browser e2e on the dev site and removes the flags and the old direct-RFC path.

## Milestones and issues

### Phase 0: Contracts (milestone #96)
- #1108 [BE]: Soporte contracts: schema and migration, types, typed stubs, query keys, capability and flags

### Phase 1: Reportar y Mis solicitudes (milestone #97)
- #1109 [BE]: Solicitud actions: create with captured context, list mine, detail, reply and withdraw
- #1110 [FE]: Reportar dialog and its entry points: account menu, ⌘K, error pages and a shortcut
- #1111 [FE]: Mis solicitudes in Ajustes › Personal: list, detail timeline and reply
- #1112 [BE/FE]: Screenshots on a solicitud: paste, drop or pick up to 3 images

### Phase 2: Mejoras (admin) (milestone #98)
- #1113 [BE]: Mejoras actions: filtered list with counts, triage, reply vs internal note, duplicates
- #1114 [FE]: Mejoras page (admin only) in the three Estilos with the sidebar entry and badge
- #1115 [FE]: Mejoras ticket detail: timeline, triage controls, reply and internal note, duplicates

### Phase 3: GitHub y asistente (milestone #99)
- #1116 [BE/FE]: Publish a solicitud to GitHub as an RFC issue after admin review
- #1117 [BE]: Cron job: sync published solicitudes with their GitHub issue state
- #1118 [BE]: Asistente: `create_ticket` files a solicitud; `create_rfc` becomes admin-only via publish

### Phase 4: Cleanup (milestone #100)
- #1119 [TEST]: Soporte and Mejoras browser e2e on the dev site
- #1120 [DOCS/OPS]: Soporte docs, GitHub token scope, flags on, and retire the direct RFC path

## Shared

UI issues: tokens only; per-style markup only in `components/widgets/*`; `PageStyleLayout` where a page has Estilos; motion off under `prefers-reduced-motion`; no font weight above 600; axe clean in light and dark; 390 px with no horizontal page scroll; Spanish sentence case; Vitest, typecheck, lint and `check-data-patterns` green.

Backend issues: zod input; `ActionResult` for every user-facing write; role and ownership re-checked in the action; DB tests as a viewer without access; rate limits through `lib/auth/rate-limit.ts`.

## Open question

Whether the Tablero-based RFC routine is still needed once solicitudes exist (#1120 records the answer).
