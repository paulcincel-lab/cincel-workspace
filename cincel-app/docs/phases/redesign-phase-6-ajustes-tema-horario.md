# Redesign Phase 6: Ajustes, tema y Control de horario

## Goal
Admins edit and publish the organization theme and style with a contrast gate, every user sets their own appearance and profile, the organization runs Control de horario (sidebar clock, login prompt, auto-close, weekly report and CSV), and every Ajustes page lives in the new shell.

## Deliverables

### Backend
- [ ] `saveOrgAppearanceAction` (`canManageAppearance`, `LOW_CONTRAST: <pair> <mode> <ratio>` via `lib/ui/contrast.ts`, revalidates the root layout, bumps `v`) and `resetOrgAppearanceAction(base)` (BE §7.1, §8.2)
- [ ] `lib/time-tracking/{settings,state,report}.ts` and `time-tracking-actions.ts`: settings fetch / save (`canManageTimeTracking`, `INVALID` rules, `requiredFrom` not in the past), `fetchMyTodayAction` (`TodayStatus` with `requiredFrom`, `hoursPerDay`), `clockInAction` / `pauseWorkAction` / `resumeWorkAction` / `clockOutAction` (`DISABLED`, `ALREADY_ON`, `NOT_ON`, row lock on pauses), `fetchMyWeekHoursAction` (BE §7.7, §8.7, §9.5)
- [ ] `fetchTeamHoursAction` (`canViewTeamHours`, targets minus `approvedAbsences`), `GET /api/horario/export?week=` (BOM, trial entries excluded, formula escaping), cron job `auto-close-jornadas` (auto-close flagged entries; missing clock-in notification at dayStart + 2 h when required) (BE §7.7, §8.7, §13)
- [ ] `app-settings-actions.ts`: save / restore switched to `canManageGeneralSettings` (the only phase that edits it) (BE §21)
- [ ] Flags flipped: `org-appearance-actions.flags.ts` (save / reset), `time-tracking-actions.flags.ts` (Rule 1)
- [ ] Tests: state machine table, `workedSeconds` with pauses, required / prompt table, auto-close, late, report statuses, lunch rule, CSV escaping; acceptance "clock in → pause → resume → auto-close flagged → report" and "org appearance save → next load renders the new block" (BE §16)

### Frontend
- [ ] Ajustes › Tema y estilo (`ThemeEditor`, evolves `PrimaryColorPicker` into `TokenRow`): "Partir de", org style cards + `allowUserOverride` + `redesignDefault`, token rows per mode, typography (`TypeScaleRow`), forma y espacio, sticky preview, `ContrastBadge`, "Publicar para todos" disabled while a pair fails, "Restablecer" with confirm, "Exportar CSS" (FE §3.8, §4.8)
- [ ] Ajustes › Apariencia (`AparienciaClient`): theme / style radio cards, modo, densidad, tamaño de texto, live preview, "Nuevo diseño" switch, disabled cards with `OVERRIDE_DISABLED` copy (FE §3.8)
- [ ] `TimeClock` in the sidebar slot `lib/shell/sidebar-slots/time-clock.tsx` (card) and the mobile compact pill: states, ticking from `startedAt`, re-sync on focus / 5 min, `role="timer"`, polite live region, rollback (FE §3.13, §16)
- [ ] `ClockInPrompt` on `FormDialog`: shown at the first staff page of a work day when enabled, off and `promptAtLogin`; skippable before `requiredFrom`, not after; "Cerrar" after an error other than `ALREADY_ON` (FE §3.10)
- [ ] Ajustes › Control de horario (`HorarioClient`): switch, "Obligatorio a partir de", timeline strip, rules, prompt preview, `TeamHoursTable` on `RecordTable` in three styles with "Exportar CSV"; Dirección sees report + read-only rules (FE §3.8)
- [ ] Ajustes › Perfil: photo via the Phase 1 route, "Mis horas esta semana" (only when enabled), editable own fields, "Cambiar contraseña" (FE §3.8)
- [ ] Ajustes › General: existing `GeneralSettingsWorkspace` on `SettingsSection` + Instagram / Sitio web / Correo fields (header links leave localStorage) (FE §3.8)
- [ ] Restyle Ajustes › Estatus, Permisos (storage unchanged), monday (page + history), Google; Tramos / Puestos link to Project Flow pages when present (FE §3.8)
- [ ] Nav items for the Ajustes entries in `lib/shell/nav-items/ajustes.ts` and settings sections under `lib/shell/settings-sections/*` (except notificaciones / integraciones, Phase 5) (FE §21.1)
- [ ] Vitest + a11y: `ThemeEditor` (preview, publish disabled, preset, reset), `TimeClock`, `ClockInPrompt`, `TeamHoursTable` styles, admin segments (FE §17)
- [ ] Playwright: admin publishes a theme and another user sees it; time tracking enable → clock in / pause / out → required date makes the prompt mandatory; existing `/configuracion/*` specs updated; run locally, result on the issue (FE §17)

### Infrastructure
- [ ] None (the cron line from Phase 1 runs `auto-close-jornadas`)

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- `Ajustes` (Apariencia), `AjustesAdmin` (Tema y estilo)
- `AjustesHorario`, `AjustesHorarioEsencial`, `AjustesHorarioAnalitico` (only the team report changes with style)
- `Perfil`, `AjustesGeneral`, `AjustesEstatus`, `AjustesPermisos`, `AjustesMonday`, `AjustesAreas` (layout reference for the Tramos y fases link)
- `LoginJornada` (clock-in prompt), `Sidebar` (tracker on), `MovilInicio` (compact clock)
- Not implemented: `AjustesWorkflows` (later feature, RD-10), the location option of `AjustesHorario` (RD-8), `InicioCutto`, `CuttoLlamada`

## Done Definition
- An admin changes any token, type role and shape value; "Publicar para todos" stays disabled while any `lib/ui/contrast.ts` pair fails; every seeded preset publishes unchanged; other users see the change on their next page load (FE §18 item 5; BE §17 item 2)
- With overrides off, theme and style controls are disabled with the §9 copy and the action throws `OVERRIDE_DISABLED` (FE §18 item 6)
- Theme, mode, style, density and text size changes apply without reload and persist on another device (FE §18 item 3)
- Control de horario: clock appears for non-exempt users only when enabled; start / pause / resume / end work; before `requiredFrom` the prompt is skippable, after it is not; the report shows completo / incompleto / sin registro and exports CSV without formula injection; disabled feature → `DISABLED` (FE §18 item 9; BE §17 items 6 and 7)
- A non-admin gets 404 on `/ajustes/general`, `/ajustes/estatus`, `/ajustes/permisos`; Dirección reaches `/ajustes/horario` (report only) (FE §18 item 18)
- The team report renders three styles inside `RecordTable`; no Ajustes page writes per-style markup (guard test) (FE §18 item 15)
- Flag off: `/configuracion/*` and `/profile` render as today
- Axe clean on every Ajustes page and the prompt in all three themes, light and dark (FE §18 item 13)
- Playwright runs recorded; Vitest green in the existing CI

## Parallel work
- BE: org appearance save / reset ∥ time-tracking core ∥ report + export + auto-close ∥ General settings capability switch
- FE tracks: ThemeEditor ∥ Apariencia ∥ TimeClock ∥ ClockInPrompt ∥ Horario page ∥ Perfil ∥ General ∥ Estatus / Permisos ∥ monday / Google
- Runs alongside Phases 2–5, 7 and 8 (Rule 2)

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: L
- Frontend: L
- Infra: S

## Risks
- Hours report targets subtract approved vacations only once Phase 4 writes requests (hidden-dependency resolution)
- Required clock-in makes the prompt undismissable; a bug here locks people out. Keep the "Cerrar after error" escape and test it
- Server time zone vs `America/Mexico_City` for work days, `dayStart + 2 h` and auto-close; use the existing trend time zone constant
- The monday and Google wizard steppers are restyled in Phase 8; this phase restyles only the settings pages around them to avoid editing the same files
