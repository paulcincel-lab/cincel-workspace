# Spec — Cronograma de Obra (Project Schedule View) — Frontend

**Project:** Cincel Workspace portal
**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui
**Reference implementation:** `Cronograma_Madrid_22_-_Dashboard.html` (single-file vanilla JS dashboard by Arq. José Ulloa for Casa Madrid 22)
**Status:** Draft v1 — 2026-09-18
**Companion doc:** `docs/specs/backend.md` (domain model, server actions, import, metrics contract for this same feature — read it first for the calculations and types this doc renders)

---

## 1. Purpose

Port the standalone Madrid 22 cronograma dashboard into a reusable, per-project schedule view inside the Cincel Workspace portal. The reference file is a one-off with data hardcoded in JS and state in `localStorage`; this spec turns it into a **generic, multi-user, database-backed feature** that any Cincel project can use, while preserving the calculations and visual language site staff already know.

### Goals

1. One `Cronograma` view per project, reachable from the project page.
2. Task progress is shared: any staff member marks a task and everyone sees it.
3. All metrics (donut, S-curve, resumen, alertas) computed from the same pure functions as the reference file (see `backend.md` §2.2), so numbers match what the client has been reading.
4. Schedule data is imported, not hand-typed: Excel/CSV import with stable task identity across re-imports.
5. Read-only snapshot ("Generar reporte") survives as a shareable/printable report.

### Non-goals (v1)

- Editing task dates/text in the UI (schedule changes happen in Excel → re-import).
- Dependencies between tasks, critical path, resource leveling.
- Cost tracking beyond the fixed payment calendar percentages.
- Notifications.

---

## 2. Sections of the view (in order)

1. **Header** — project name, address, week navigation (← Hoy →), actions (Exportar / Importar / Generar reporte).
2. **Cronograma general** — Gantt by sección with month ticks and a dashed "today" line.
3. **Avance del proyecto** — triple-ring donut (planeado / programado / real) + legend; S-curve with the same three series and today marker.
4. **Tareas por semana** — three columns: semana anterior / esta semana / próxima semana. Each card cycles status on click; ⚠ toggles flag. Column header shows `done / total completadas · n en proceso`. The column matching the real current week gets a `HOY` badge.
5. **Alertas** — Tareas atrasadas + Atención especial. Same card control as boards.
6. **Resumen** — two cards: Resumen 1 (planeado vs programado vs real + delay labels), Resumen 2 (en tiempo + adelantos = total).
7. **Trabajos realizados imprevistos** — list newest-first, add form (texto + fecha), delete.
8. **Adicionales de obra** — grouped list, read-only.
9. **Footer** — credits.

---

## 3. Section color palette

Section order and color (fixed palette; the order itself is canonical in `backend.md` §2.1 since it drives `seccionOrder` at import time — this doc owns the color mapping):

```ts
// sections.ts (co-located with backend's lib/sections.ts export of SECTION_ORDER)
export const SECTION_COLOR: Record<string, string> = {
  'Preliminares': 'bg-orange-500',
  'Albañilerías': 'bg-violet-500',
  'Instalaciones eléctricas': 'bg-yellow-400',
  'Suministro apagadores y contactos': 'bg-fuchsia-500',
  'Instalaciones hidrosanitarias': 'bg-cyan-500',
  'Instalación de gas': 'bg-red-500',
  'Acabados': 'bg-blue-500',
  'Carpinterías': 'bg-green-500',
  'Cancelerías y herrerías': 'bg-red-500',
};
export const UNKNOWN_SECTION_COLOR = 'bg-muted-foreground';
```

Unknown secciones from other projects fall back to the neutral token and sort after known ones (alphabetically). Dark mode via existing portal theme; SVG charts use `currentColor` / CSS vars, not hardcoded hex.

---

## 4. Module layout (client + shared lib)

```
src/
  features/cronograma/
    lib/                        ── SHARED with backend.md §4, zero React/DOM/DB imports ──
      week.ts            mondayOf, addDays, isoDate, weekBounds, fmtRange, fmtShort (Spanish months)
      hash.ts            djb2 → stableKey
      metrics.ts         PURE: computeProgress, computeSCurve, computeResumen, computeAlertas, tasksInRange, ganttBySeccion
      sections.ts        SECTION_ORDER, SECTION_COLOR (Tailwind tokens)
    components/
      cronograma-view.tsx        client composition root; owns optimistic state
      cronograma-header.tsx
      gantt-chart.tsx
      progress-donut.tsx
      s-curve-chart.tsx
      week-boards.tsx
      task-card.tsx              status button + flag button + meta
      alertas-panel.tsx
      resumen-cards.tsx
      imprevistos-panel.tsx
      adicionales-panel.tsx
      import-dialog.tsx
    types.ts             ── SHARED with backend.md §5 ──
  app/(portal)/projects/[projectId]/cronograma/page.tsx        server component → <CronogramaView data />
  app/(portal)/projects/[projectId]/cronograma/reporte/page.tsx read-only snapshot (see backend.md §7)
```

`lib/metrics.ts` must have **zero React/DOM/DB imports**. It is the single source of numbers for the view, the report, and any future API/PDF, imported directly by both server (`queries.ts`) and client (`cronograma-view.tsx`) code — see `backend.md` §4/§5 for the server-side half of this shared module.

---

## 5. Types consumed by the UI

See `backend.md` §5 for the canonical definitions (`ScheduleStatus`, `ScheduleTask`, `PaymentRow`, `Imprevisto`, `Adicional`, `CronogramaData`, `ProgressMetrics`, `GapStatus`, `SCurvePoint`) — this frontend imports them from `features/cronograma/types.ts` rather than redeclaring them.

All metric functions take `(data, today: Date)` — `today` is injected, never read from `Date.now()` inside `lib/`, so the report page and component tests can pin it.

---

## 6. Components (shadcn mapping)

| Component | shadcn primitives | Behavior |
|---|---|---|
| `CronogramaHeader` | `Button`, `ButtonGroup`, `DropdownMenu`, `Badge` | Week nav updates `?week=`; "Hoy" resets. Actions menu: Exportar JSON, Importar, Generar reporte. |
| `GanttChart` | `Card`, `Tooltip` | Pure SVG/CSS-grid, one row per sección. Month ticks, today line. Tooltip on bar: range + task count. Horizontal scroll on mobile. |
| `ProgressDonut` | `Card` | Inline SVG, three concentric rings (planned/pagos/real), center = real %. Legend as list with `Badge` dots. |
| `SCurveChart` | `Card` | SVG polyline ×3, gridlines 0/25/50/75/100, month labels, today marker. Uses Recharts is acceptable if it does not change the look; default to hand SVG for parity. |
| `WeekBoards` | `Card` ×3, `ScrollArea` | Three columns; on `md+` side by side, stacked on mobile with current week first. Preserve scroll position across re-renders (`ScrollArea` ref). |
| `TaskCard` | `Button` (status), `Toggle` (flag), `Badge` | Click status → cycles `pending → progress → done → pending`. Optimistic; reverts with `toast` on failure. Disabled in report mode. Keyboard: Space/Enter cycles, `F` toggles flag. |
| `AlertasPanel` | `Card`, `Separator` | Two groups. Reuses `TaskCard`. Empty states copied from reference. |
| `ResumenCards` | `Card` | Formula rows (formulas defined in `backend.md` §2.2). Delay label colored red/aqua/muted. |
| `ImprevistosPanel` | `Card`, `Form`, `Input`, `Textarea`, `Calendar`/`Popover` date picker, `AlertDialog` (delete) | Newest first. Add via server action (`backend.md` §4 `actions.ts`), `useOptimistic`. |
| `AdicionalesPanel` | `Card`, `Accordion` | Collapsed by default except on report. |
| `ImportDialog` | `Dialog`, `Tabs`, `Table`, `Alert` | Tab 1: Excel/CSV schedule (preview with diff: new/kept/removed tasks — diff algorithm in `backend.md` §8.1). Tab 2: legacy JSON state (`backend.md` §8.2). |

Reuse existing shadcn primitives already in `components/ui/shadcn/` per project convention (see root `AGENTS.md` — do not create new components where a reusable one exists).

---

## 7. Data flow & client state

```
page.tsx (RSC)
  └─ getScheduleForProject(projectId)  (backend.md §6) ── one query, joins 5 tables ──▶ CronogramaData
       └─ <CronogramaView data today={serverNow} />   (client)
            ├─ useOptimistic(data.tasks)  → metrics recomputed with useMemo on every status/flag change
            ├─ week offset from useSearchParams
            └─ server actions (backend.md §4 actions.ts) → revalidatePath(`/projects/${id}/cronograma`)
```

- **Single read, client-side recompute.** Metrics are cheap (323 tasks × ~15 weeks); recompute on the client from optimistic state rather than round-tripping.
- **Concurrency.** Actions accept `expectedStatus`; if the DB row differs, the action returns `{ conflict: true, current }` (see `backend.md` §6) and the client re-syncs instead of overwriting.
- **Authorization.** Any project member with `staff` role can change status/flags/imprevistos. Client-role users (CRM contact types) get the read-only variant — same component, `readOnly` prop, identical to report mode.
- **`today`** comes from the server (project timezone `America/Mexico_City`); the client never uses its own clock, so numbers match for every viewer.
- **No `localStorage` usage anywhere in this feature** — this is an explicit acceptance criterion (backend.md §10.5), since it's the exact anti-pattern this port is replacing.

---

## 8. Responsiveness & a11y

- Mobile: boards stack (current week first), Gantt scrolls horizontally inside its card, charts scale via `viewBox`.
- Status button is a real `<button>` with `aria-label="Estado: en proceso — clic para marcar realizada"`; flag is `aria-pressed`.
- All numbers in the donut/S-curve are also present as text in the legend (screen readers).
- Color is never the only signal: status uses icon + text, delay label uses text.

---

## 9. Report / export (client-visible surface)

- **`/cronograma/reporte`** — server-rendered, `readOnly`, `Accordion`s expanded, print stylesheet (`@media print`: no nav, one section per page break where sensible). Accepts `?asOf=YYYY-MM-DD` to reproduce a past week (see `backend.md` §7 for the server route contract).
- **Exportar** — triggers `GET /api/projects/[id]/cronograma/export` (backend.md §7), same JSON shape the reference file exports.
- **PDF** — out of scope v1; print-to-PDF from the report route is sufficient.

---

## 10. Testing (frontend)

- **Component** — `TaskCard` cycles status and reverts on action failure; `readOnly` disables both controls.
- **Component** — `GanttChart`, `ProgressDonut`, `SCurveChart` render correctly against the golden MD22 dataset fixtures used by `backend.md` §9's metrics tests (shared fixtures, not re-derived).
- **E2E (Playwright)** — mark a task in one browser context, reload in a second, see it updated (exercises the full client → server action → revalidate loop).

---

## 11. Acceptance criteria (frontend-relevant)

1. Opening `/projects/{md22}/cronograma` on 2026-09-18 shows the same planned %, programado %, real %, en tiempo %, adelantos %, and delay labels as the reference HTML with the client's latest exported state imported.
2. Status and flag changes persist and are visible to another user without file exchange.
3. Week navigation, Gantt, donut, S-curve, boards, alertas, resumen, imprevistos, adicionales all present and visually consistent with the portal's shadcn theme.
4. Report route prints cleanly and accepts `?asOf`.
5. No `localStorage` usage anywhere in the feature.

---

## 12. Open questions

1. Should clients (external contacts with portal access) see the imprevistos/adicionales panels? Default: yes, read-only — that's the point of the report today.
2. (Shared with backend.md — see that doc's §11 for the `responsable`/CRM-linking and payment-calendar-ownership questions, which are backend-scoped but affect how `ImprevistosPanel`/`ResumenCards` eventually render if answered differently.)
