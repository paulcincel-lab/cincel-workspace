# Estilos: per-style layouts for every page

Reference for GitHub milestones **#74–#84** ("Estilos Phase 1" to "Estilos Phase 11") and issues **#979–#1017**, created 2026-11-09.

- **Mocks:** design canvas https://claude.ai/artifact/8mqoiJjMQr6ZCMXG1ZjhKG. It has 42 frames, one row per page, each row showing Visual / Esencial / Analítico side by side, in the Azul Cincel theme.
- **Decisions:**
  - [ADR 0004](../adr/0004-estilo-replaces-view-switch.md): the Estilo replaces the view switch.
  - [ADR 0005](../adr/0005-per-style-widget-kit.md): the shared per-style widget kit.
  - [ADR 0006](../adr/0006-mock-elements-without-data.md): what to do with mock elements that have no data yet.
- **Direction:** recorded in ADR 0004. Visual is heavily visual (boards, charts, motion), Esencial a notably lighter version, and Analítico shows all data in tables grouped by domain.

## Delivery model

- **No blocking order:** no issue blocks another, so every phase is coded at the same time, merged, and then tested together.
- **Shared names:** the Phase 1 issues define the component names and types. Page issues refer to them with "Uses #98x", which is a pointer, not a dependency.
- **Contracts first:** in a parallel implementation run, the contracts issue (#979) lands first because every page codes against its names.
- **Cleanup last:** Phase 11 (#1017) only removes code the new layouts no longer import, so it runs last in the same integration.
- **Single owner for shared new data:** when two issues need the same new field or query, the issue that owns it is named, and the others only consume it.

## Issue format

Every issue has these sections:
- Context
- Scope
- Visual reference (the canvas frame names)
- Contract (Implements / Consumes, with file paths)
- Acceptance criteria
- Tests
- Out of scope

The detailed issues add Data, States and permissions, Keyboard and ARIA, and Decision needed. Every "Decision needed" item comes with a recommended default, so work can start without waiting for an answer.

All issues share these acceptance criteria:
- tokens only;
- per-style markup only in `components/widgets/*`;
- motion off under `prefers-reduced-motion`;
- Spanish sentence case, with no font weight above 600;
- axe clean in light and dark;
- 390 px with no horizontal scroll;
- Vitest, typecheck and lint green.

Labels: `frontend` and `ui/ux` on all issues. `backend` is added where the issue also adds a query, field or migration.

## Milestones and issues

### Phase 1: Shared building blocks (milestone #74)

| Issue | Title | Shared names it implements |
|---|---|---|
| #979 | Estilos contracts: per-style page layout API and shared widget names | `PageStyleLayout`, typed stubs for every name below; guard allowlist |
| #980 | Shell: page header with Estilo switch, sidebar and header per canvas | `PageHeader` (with `estilo?: boolean`); Tareas Vista switch removed from the header, `?vista=` links still work |
| #981 | Tokens and motion: tramo and status colors, shared animation utilities | tramo slots 1–4, status colors, tint tokens, `foreground-soft`, `destructive-ink`; `anim-in`, `row-new`, `lift`, `draw`, `grow`, `ring`, `rise` + `staggerStyle`, `spin`, `glow`, `typing` |
| #982 | Analítico kit: GroupedTable, KpiStrip and FilterCard | `GroupedTable` (two levels, totals, heat cells, anchors), `KpiStrip`, `FilterCard` (square segmented groups) |
| #983 | Esencial kit: EsencialCard and EsencialItemRow | `EsencialCard`, `EsencialItemRow` (status at the end), `StatusChip variant="dot"` |
| #984 | Smart quick-add: write on the last line to create a task | `parseQuickAdd` (`@persona`, `#tramo`, dates, `!prioridad`), `QuickAddRow` (`row` / `card` / `column`) |
| #985 | Visual kit: chart and board motion, lift cards | motion on existing charts and cards; `TaskBoardWidget` `renderColumnFooter` |

### Phase 2: Tareas (milestone #75)

| Issue | Style | Frames | New data |
|---|---|---|---|
| #986 | Visual: team kanban with KPI sparklines, status donut and week strip | `Tareas-Visual` | `mostrar` filter and counts; `qk.tareas.trend(f)` (7-day series, deltas, due per day) |
| #987 | Esencial: one soft card per project with quick-add | `Lista-Esencial` | `qk.tareas.byProject(f)` (counts per project, open rows, cap 200) |
| #988 | Analítico: grouped project → tramo with KPI strip and filter card | `Main`, `Analitico-Vencidas` | `qk.tareas.summary(f)` (SQL grouping sets over project+tramo, project, total); `orderBy: "retraso"` |

### Phase 3: Inicio (milestone #76)

| Issue | Style | Frames | New data |
|---|---|---|---|
| #989 | Visual: greeting hero, KPI sparklines, charts and project rings | `Inicio-Visual` | `hero`, `openShifts`, `todayAgenda`; KPIs `abiertas`, `horas_semana`; fields on `AttentionItem`, `ProgressItem` |
| #990 | Esencial: this week, attention and project progress | `Inicio-Esencial` | `myWeek`, `myAttention`, `ProgressItem.atRisk` |
| #991 | Analítico: KPI strip, filter card and grouped tables | `Inicio-Analitico` | KPI `retraso_promedio`; `AttentionItem.projectId`/`status`; `PersonDatum.inProgress`/`avgDaysLate` |

### Phase 4: Proyectos (milestone #77)

| Issue | Page and style | Frames | New data |
|---|---|---|---|
| #992 | List · Visual: tramo summary, attention cards, portfolio board, delivery timeline | `Proyectos-Visual` | `ProjectListItem.members`; drag uses `setProjectCurrentTramoAction` |
| #993 | List · Esencial: tramo pills and soft project cards | `Proyectos-Esencial` | none |
| #994 | List · Analítico: KPI strip, filter card, portfolio grouped by tramo | `Proyectos-Analitico` | `avgDelayDays`, `overdueWeekAgo`, `avgDelayWeekAgo` on `PortfolioRow` |
| #995 | Resumen · Visual: progress hero, status donut, team load, S-curve, activity | `ProyectoResumen-Visual` | `teamLoad`; tareas and history prefetch; `thumbnailLink` |
| #996 | Resumen · Esencial: tramo line, next tasks, team, recent files | `ProyectoResumen-Esencial` | `phasesByTramo`, `taskStats.currentPhaseId` |
| #997 | Resumen · Analítico: KPI strip, tramos y fases, team load, tasks by tramo | `ProyectoResumen-Analitico` | fase plan dates (source to confirm); `suggestAssignee` read |

### Phase 5: Personas (milestone #78)

| Issue | Style | Frames | New data |
|---|---|---|---|
| #998 | Visual: team load board, saturation banner, 4-week heatmap | `Personas-Visual` | `PeopleOverviewRow.weeks` (4 × `WeekLoad`), `absences` |
| #999 | Esencial: person list with load bar, expandable tasks, quick assign | `Personas-Esencial` | none; helpers `loadBucket`, `personStatus`, `suggestAssignee` |
| #1000 | Analítico: people table grouped by tramo with 4-week capacity | `Personas-Analitico` | `projects: PersonProjectLoad[]`, `sharesProjectWithViewer`; real filter counts |

### Phase 6: Mi espacio (milestone #79)

| Issue | Style | Frames | New data |
|---|---|---|---|
| #1001 | Visual: day hero with jornada ring, task board, weekly hours chart | `MiEspacio-Visual` | `me.tasks()` query; `weekStart` on `fetchMyWeekHoursAction` |
| #1002 | Esencial: tasks by project, notes, bandeja, checklist | `MiEspacio-Esencial` | none beyond `me.tasks()` |
| #1003 | Analítico: tasks, hours, bandeja and checklists tables | `MiEspacio-Analitico` | `me.notificationsSummary()`; checklist `projectName`, `updatedAt` |

### Phase 7: Biblioteca (milestone #80)

| Issue | Style | Frames | New data |
|---|---|---|---|
| #1004 | Visual: overview hero, recent previews, section cards, featured templates | `Biblioteca-Visual` | storage quota and template usage hidden until a source exists |
| #1005 | Esencial: soft lists of recents, La empresa and Recursos | `Biblioteca-Esencial` | none |
| #1006 | Analítico: documents by section and project in a grouped table | `Biblioteca-Analitico` | `resource_links.project_id`; `resource_link_opens` + 30-day aggregate; `drive_files.size_bytes` |

### Phase 8: Asistente (milestone #81)

| Issue | Scope | Frames | New data |
|---|---|---|---|
| #1007 | Tool steps and confirmation preview (`ToolSteps`, all styles) | all `Asistente-*` | `AssistantMessageMeta` (tool ms, response ms, usage) in `assistant_messages.metadata jsonb`; `TOOL_STEP_DEFS`; approval previews |
| #1008 | Visual: threads rail, pinned chat with steps, suggestion cards | `Asistente-Visual` | `assistant_threads.pinned_at`, `last_read_at`; `pendingApprovals`, `unread` |
| #1009 | Esencial: light chat, compact steps, pinned composer | `Asistente-Esencial` | none; `useScrollAnchor` hook |
| #1010 | Analítico: steps table, data panel, response metrics | `Asistente-Analitico` | `assistant_threads.tool_call_count`; extra fields on two tool outputs |

### Phase 9: Portal (milestone #82)

| Issue | Style | Frames | New data |
|---|---|---|---|
| #1011 | Visual: project hero, phases, deliveries, documents, team | `Portal-Visual` | per-tramo progress; `getPortalTeam`; folder listing; `companyName`; cover photo |
| #1012 | Esencial: one-line status, phase dots, deliveries, documents, contact | `Portal-Esencial` | none beyond #1011 |
| #1013 | Analítico: KPI strip, phases by tramo, deliverables, files by folder | `Portal-Analitico` | `schedule_tasks.started_on`/`finished_on`; `project_progress_snapshots`; section → tramo link |

### Phase 10: Ajustes (milestone #83)

Settings forms ignore the presentation style and keep one layout. The one exception is Horas del equipo, which keeps per-style markup inside a widget.

| Issue | Pages | Frames | New data |
|---|---|---|---|
| #1014 | Personal: Apariencia, Notificaciones, Perfil, Integraciones | `Ajustes-Apariencia`, `-Notificaciones`, `-Perfil`, `-Integraciones` | none |
| #1015 | Organización: General, Tema, Horario, Google | `Ajustes-General`, `-Tema`, `-Horario`, `-Google` | `pendingGoogleStaff`; group member counts (cached); `TeamHoursRow.needsReview` |
| #1016 | Catálogos: Estatus, Puestos, Tramos, Permisos, monday | `Ajustes-Estatus`, `-Puestos`, `-Tramos`, `-Permisos`, `-Monday` | status usage counts and reorder; `positions.weekly_capacity_hours`; `workflows.color_slot` and reorder; monday column fill |

### Phase 11: Cleanup (milestone #84)

| Issue | Scope |
|---|---|
| #1017 | Remove the Tareas `vista` param, `TareasCalendario` and `PersonasViewToggle`; redirect `?vista=` (`tablero` → `?estilo=visual`, `lista` → `?estilo=analitico`, `calendario` → no param) |

## Open product decisions

Each item below has a recommended default in its issue. The issue body holds the full list.

| Topic | Issues | Recommended default |
|---|---|---|
| Staff names in the portal ("Tu equipo Cincel", "Subido por") | #1011, #1013 | Name and role only (email for the manager); uploads show "Tú" or "Cincel" |
| Load ("carga") unit | #998–#1003 | Open tasks ÷ `staff.capacity` (tasks, not hours); hours by project left out |
| Fase plan dates | #997 | Earliest task creation date and latest commitment date of the fase |
| Base status colors (the Estatus and Tema frames disagree) | #1016 | #981 status tokens |
| "En riesgo" rule for projects | #990 | Overdue share ≥ 45 % of open tasks |
| "Editar" on an Asistente confirmation | #1007 | Deny with reason, then put the rows in the composer |
| "Atrasados vs plan" threshold | #994 | Deviation ≤ −3 points |
| "Solo mi equipo" meaning | #1000 | Shares an active project with the viewer |
| Load thresholds (frames use three sets) | #998–#1000 | One set: 60 / 80 / 100 % |
| Page title size | #980 | Org type scale (22 px); the frames show 32 px |
| Type scale defaults | #1015 | Update the Azul defaults to the frame |
| Filters drawn as pills in some Analítico frames | #994, #1000, #1003, #1006 | Square `FilterCard` |
