"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { FilterCard } from "@/components/widgets/FilterCard";
import { GroupedTable, type Group, type HeatRule } from "@/components/widgets/GroupedTable";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { LineSeriesWidget, type LineSeries } from "@/components/widgets/LineSeriesWidget";
import { PageHeader } from "@/components/widgets/PageHeader";
import { QuickAddRow } from "@/components/widgets/QuickAddRow";
import { formatValue } from "@/components/widgets/record-table-format";
import {
  ANALITICO_SECTION,
  ATTENTION_PAGE_SIZE,
  DAYS_CRIT_AT,
  DAYS_WARN_AT,
  NET_CRIT_AT,
  SHARE_CRIT_AT,
  SHARE_WARN_AT,
  agendaDayLabel,
  agendaTime,
  analiticoDescription,
  analiticoKpis,
  attentionSummary,
  countLabel,
  daysText,
  lastWeekNet,
  paceTotals,
  pctOf,
  segmentDays,
  shareHeat,
  signed,
  sortAgenda,
  tramoTotals,
  workloadTotals,
  type AttentionProject,
} from "@/lib/inicio/analitico";
import {
  filterAgenda,
  filterAttention,
  filterTramos,
  filterWorkload,
  hasActiveFilters,
  type InicioAnaliticoFilters,
} from "@/lib/inicio/analitico-filters";
import { greetingFor } from "@/lib/inicio/header";
import { DASHBOARD_RANGE_WEEKS, isDashboardRange, sliceToRange } from "@/lib/stores/dashboard-store";
import { useInicioDashboard, type InicioWidget } from "@/lib/stores/inicio-dashboard-store";
import { statusColorToken, statusDotClass } from "@/lib/tasks/status-options";
import type { InicioData } from "@/lib/types/redesign";
import type { TaskStatus } from "@/lib/types/core";
import type { RecordColumn } from "@/lib/types/widgets";

import { useInicioQuickAdd } from "./use-inicio-quick-add";
import { weekLabel } from "./WeeklyPaceChart";

export type InicioAnaliticoProps = {
  data: InicioData;
  firstName: string;
  /** The instant the page was rendered at (greeting, date and agenda day). */
  now: Date;
};

/** Select value for "Todos" (Select items can't carry null). */
const ALL = "__todos__";

/** Each section's collapse key in `useInicioDashboard.collapsed`. */
const SECTION_WIDGET: Record<keyof typeof ANALITICO_SECTION, InicioWidget> = {
  atencion: "attention",
  ritmo: "weeklyPace",
  carga: "workload",
  tramos: "tramoDonut",
  agenda: "todayAgenda",
};

const RANGE_OPTIONS = [
  { value: "4w", label: "4 sem" },
  { value: "8w", label: "8 sem" },
  { value: "12w", label: "12 sem" },
];

const NO_MATCH = "No hay resultados con estos filtros";
const LONG_TEXT = "inline-block max-w-[320px] truncate align-bottom";

const PACE_SERIES: LineSeries[] = [
  { key: "completed", label: "Completadas", colorVar: "var(--chart-1)" },
  { key: "created", label: "Creadas", colorVar: "var(--chart-4)", dashed: true },
];

// ── Columns and heat (strict rules on whole numbers: ≥ n is > n − 1) ────────

const ATTENTION_COLUMNS: RecordColumn[] = [
  { key: "nombre", label: "Proyecto / tramo / tarea", width: 320 },
  { key: "responsable", label: "Responsable", width: 150 },
  { key: "estatus", label: "Estatus", width: 130 },
  { key: "vence", label: "Vence", mono: true, format: "date", width: 90 },
  { key: "vencidas", label: "Vencidas", align: "right", mono: true, format: "count", width: 90 },
  { key: "dias", label: "Días de retraso", align: "right", mono: true, format: "count", width: 120 },
];
const ATTENTION_HEAT: HeatRule[] = [{ key: "dias", warnAt: DAYS_WARN_AT - 1, critAt: DAYS_CRIT_AT - 1 }];

const PACE_COLUMNS: RecordColumn[] = [
  { key: "semana", label: "Semana", width: 120 },
  { key: "created", label: "Creadas", align: "right", mono: true, format: "count", width: 80 },
  { key: "completed", label: "Completadas", align: "right", mono: true, format: "count", width: 100 },
  { key: "neto", label: "Neto", align: "right", mono: true, format: "delta", width: 60 },
];
const PACE_HEAT: HeatRule[] = [{ key: "neto", warnAt: NET_CRIT_AT + 1, critAt: NET_CRIT_AT + 1, direction: "below" }];

const WORKLOAD_COLUMNS: RecordColumn[] = [
  { key: "persona", label: "Persona", width: 200 },
  { key: "carga", label: "Carga", width: 184 },
  { key: "abiertas", label: "Abiertas", align: "right", mono: true, format: "count", width: 80 },
  { key: "enProceso", label: "En proceso", align: "right", mono: true, format: "count", width: 90 },
  { key: "vencidas", label: "Vencidas", align: "right", mono: true, format: "count", width: 80 },
  { key: "pctVencidas", label: "% vencidas", align: "right", mono: true, format: "percent", width: 100 },
  { key: "retraso", label: "Retraso prom.", align: "right", mono: true, width: 110 },
];
const SHARE_HEAT_RULE: HeatRule = { key: "pctVencidas", warnAt: SHARE_WARN_AT - 1, critAt: SHARE_CRIT_AT - 1 };

const TRAMO_COLUMNS: RecordColumn[] = [
  { key: "tramo", label: "Tramo", width: 180 },
  { key: "distribucion", label: "Distribución", width: 224 },
  { key: "abiertas", label: "Abiertas", align: "right", mono: true, format: "count", width: 80 },
  { key: "vencidas", label: "Vencidas", align: "right", mono: true, format: "count", width: 80 },
  { key: "pctVencidas", label: "% vencidas", align: "right", mono: true, format: "percent", width: 100 },
  { key: "dias", label: "Días prom.", align: "right", mono: true, width: 90 },
];

const AGENDA_COLUMNS: RecordColumn[] = [
  { key: "hora", label: "Hora", mono: true, width: 70 },
  { key: "actividad", label: "Actividad", width: 280 },
  { key: "proyecto", label: "Proyecto", width: 180 },
  { key: "tramo", label: "Tramo", width: 140 },
  { key: "tipo", label: "Tipo", width: 90 },
  { key: "responsable", label: "Responsable", width: 150 },
];

// ── Row shapes ──────────────────────────────────────────────────────────────

type AttentionRow = {
  id: string;
  kind: "tramo" | "task";
  nombre: string;
  href: string | null;
  color: string | null;
  responsable: string | null;
  estatus: string | null;
  statusValue: TaskStatus | null;
  vence: string | null;
  /** Tramo rows: the tramo's overdue count. */
  vencidas: number | null;
  /** Task rows: days late (heat); tramo rows keep their sum in `diasTotal`. */
  dias: number | null;
  diasTotal: number | null;
};

type PaceRow = { id: string; semana: string; created: number; completed: number; neto: number };
type WorkloadRow = {
  id: string;
  persona: string;
  href: string | null;
  occupancy: number;
  abiertas: number;
  enProceso: number | null;
  vencidas: number;
  pctVencidas: number | null;
  retraso: string;
};
type TramoRow = {
  id: string;
  tramo: string;
  color: string;
  share: number;
  abiertas: number;
  vencidas: number;
  pctVencidas: number | null;
  dias: string;
};
type AgendaRow = {
  id: string;
  hora: string;
  actividad: string;
  href: string | null;
  proyecto: string;
  tramo: string | null;
  color: string | null;
  tipo: string;
  responsable: string;
};

// ── Small pieces ────────────────────────────────────────────────────────────

function Dot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: color }} />
  );
}

/** A value with its unit for screen readers (heat cells). */
function WithUnit({ value, unit }: { value: string; unit: string }) {
  return (
    <>
      {value}
      <span className="sr-only"> {unit}</span>
    </>
  );
}

/** A full-width message row in a section table (empty and no-match states). */
function MessageRow({ colSpan, title, onClear }: { colSpan: number; title: string; onClear?: () => void }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyState title={title} action={onClear ? { label: "Quitar filtros", onClick: onClear } : undefined} />
      </td>
    </tr>
  );
}

function Bar({ pct, color, width, label }: { pct: number; color: string; width: number; label: string }) {
  return (
    <span className="inline-flex items-center">
      <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-muted" style={{ width }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(pct, 100))}%`, backgroundColor: color }} />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function metric(key: string, label: string, value: number | string, tone?: "destructive") {
  return { key, label, value: String(value), labelFirst: true, ...(tone ? { tone } : {}) };
}

// ── Page ────────────────────────────────────────────────────────────────────

/**
 * Inicio Analítico (#991, frame `Inicio-Analitico`): the operating summary.
 * Header, KPI strip, one filter card (Rango, Responsable, Tramo, Expandir /
 * Contraer todo), the "Ir a" links and five sections, each a `GroupedTable`
 * card: Atención (project → tramo → task, with quick-add), Ritmo semanal
 * (table plus the line chart), Carga por persona (`showTeamWorkload` only),
 * Tareas abiertas por tramo and Agenda de hoy. Range, filters and collapsed
 * sections live in `useInicioDashboard`; Responsable and Tramo filter the
 * tables only (never the KPIs or Ritmo semanal).
 */
export function InicioAnalitico({ data, firstName, now }: InicioAnaliticoProps) {
  const range = useInicioDashboard((s) => s.range);
  const setRange = useInicioDashboard((s) => s.setRange);
  const collapsed = useInicioDashboard((s) => s.collapsed);
  const setCollapsed = useInicioDashboard((s) => s.setCollapsed);
  const filters: InicioAnaliticoFilters = useInicioDashboard((s) => s.filters);
  const setFilter = useInicioDashboard((s) => s.setFilter);
  const clearFilters = useInicioDashboard((s) => s.clearFilters);
  const quickAdd = useInicioQuickAdd();

  const [openProjects, setOpenProjects] = useState<string[] | null>(null);
  const [taskLimits, setTaskLimits] = useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = useState("");

  const showWorkload = data.sections?.showTeamWorkload ?? true;
  const showRisk = data.sections?.showProjectRisk ?? true;
  const filtered = hasActiveFilters(filters);
  const byTramoAssignee = data.tasksByTramoAssignee ?? [];

  const weeks = sliceToRange(data.weeklyPace, range);
  const weekCount = DASHBOARD_RANGE_WEEKS[range];
  const pace = paceTotals(weeks);

  const fullAttention = useMemo(
    () => attentionSummary(data.attention, data.projectsProgress, data.tasksByTramo),
    [data.attention, data.projectsProgress, data.tasksByTramo],
  );
  const attention = useMemo(
    () => attentionSummary(filterAttention(data.attention, filters), data.projectsProgress, data.tasksByTramo),
    [data.attention, data.projectsProgress, data.tasksByTramo, filters],
  );
  const people = filterWorkload(data.workload, filters, byTramoAssignee);
  const workload = workloadTotals(people);
  const tramos = filterTramos(data.tasksByTramo, filters, byTramoAssignee);
  const tramoSum = tramoTotals(tramos);
  const allTramoOpen = tramoTotals(data.tasksByTramo).open;
  const agenda = sortAgenda(filterAgenda(data.todayAgenda, filters));
  const tramoInfo = new Map(data.tasksByTramo.map((s) => [s.key, s]));

  const isOpen = (section: keyof typeof ANALITICO_SECTION) => !(collapsed[SECTION_WIDGET[section]] ?? false);
  const sectionsShown = (Object.keys(SECTION_WIDGET) as (keyof typeof ANALITICO_SECTION)[]).filter(
    (s) => s !== "carga" || showWorkload,
  );

  // Atención projects: the first (most overdue) expanded until the user picks.
  const expandedProjects = openProjects ?? (attention.projects[0] ? [attention.projects[0].id] : []);

  function setAll(open: boolean) {
    for (const section of sectionsShown) setCollapsed(SECTION_WIDGET[section], !open);
    if (open) setOpenProjects(attention.projects.map((p) => p.id));
    setAnnouncement(open ? "Secciones expandidas" : "Secciones contraídas");
  }

  function onSectionExpanded(section: keyof typeof ANALITICO_SECTION, ids: string[]) {
    setCollapsed(SECTION_WIDGET[section], !ids.includes(ANALITICO_SECTION[section]));
  }

  function goTo(event: MouseEvent<HTMLAnchorElement>, section: keyof typeof ANALITICO_SECTION) {
    event.preventDefault();
    const id = ANALITICO_SECTION[section];
    setCollapsed(SECTION_WIDGET[section], false);
    const target = document.getElementById(id);
    if (!target) return;
    const reduced =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.style.scrollMarginTop = "16px";
    if (typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    const header = target.querySelector<HTMLElement>("button[aria-expanded]");
    if (header) {
      header.focus({ preventScroll: true });
    } else {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }

  // ── Header and KPI strip ──
  const kpis = analiticoKpis(data.kpis, data.projectsProgress, showRisk);

  // ── Responsable and Tramo options ──
  const assignees = new Map<string, string>();
  for (const p of data.workload) assignees.set(p.id, p.name);
  for (const a of data.attention) if (a.assignee) assignees.set(a.assignee.id, a.assignee.name);
  for (const a of data.todayAgenda) if (a.assignee) assignees.set(a.assignee.id, a.assignee.name);
  const responsableOptions = [...assignees].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const tramoOptions = data.tasksByTramo.map((s) => [s.key, s.label] as const);

  // ── Atención groups ──
  const attentionGroups: Group<AttentionRow>[] = attention.projects.map((project) => projectGroup(project));
  function projectGroup(project: AttentionProject): Group<AttentionRow> {
    const limit = taskLimits[project.id] ?? ATTENTION_PAGE_SIZE;
    const rows: AttentionRow[] = [];
    let more = false;
    for (const tramo of project.tramos) {
      rows.push({
        id: `${project.id}:${tramo.key}`,
        kind: "tramo",
        nombre: tramo.label,
        href: null,
        color: tramo.colorVar,
        responsable: null,
        estatus: null,
        statusValue: null,
        vence: null,
        vencidas: tramo.overdue,
        dias: null,
        diasTotal: tramo.daysLate,
      });
      if (tramo.tasks.length > limit) more = true;
      for (const task of tramo.tasks.slice(0, limit)) {
        rows.push({
          id: task.id,
          kind: "task",
          nombre: task.title,
          href: task.href,
          color: null,
          responsable: task.assignee?.name ?? null,
          estatus: task.status?.label ?? task.reason,
          statusValue: task.status?.value ?? null,
          vence: task.due,
          vencidas: null,
          dias: task.daysLate,
          diasTotal: null,
        });
      }
    }
    const heat = shareHeat(project.overduePct);
    return {
      id: project.id,
      label: project.name,
      caption: countLabel(project.tramos.length, "tramo", "tramos"),
      metrics: [
        ...(project.overduePct !== null
          ? [
              {
                key: "pct",
                value: `${project.overduePct} % vencidas`,
                pill: true,
                tone: heat === "crit" ? ("destructive" as const) : heat === "warn" ? ("warning" as const) : ("default" as const),
              },
            ]
          : []),
        {
          key: "resumen",
          value: `${countLabel(project.overdue, "vencida", "vencidas")} · ${project.daysLate} d`,
          tone: "muted" as const,
        },
      ],
      rows,
      hasMore: more,
      quickAdd: (
        <QuickAddRow
          variant="row"
          colSpan={ATTENTION_COLUMNS.length}
          context={{
            label: "Nueva tarea",
            projectId: project.id,
            placeholder: "Nueva tarea… (@persona #tramo mañana)",
          }}
          onCreate={(draft) => quickAdd.create({ projectId: project.id, tramoKeys: project.tramos.map((t) => t.key) }, draft)}
          disabled={quickAdd.pending}
        />
      ),
    };
  }

  const attentionEmpty = attention.projects.length === 0;
  const attentionMessage = attentionEmpty ? (
    <MessageRow
      colSpan={ATTENTION_COLUMNS.length}
      title={filtered && fullAttention.projects.length > 0 ? NO_MATCH : "Todo al día"}
      onClear={filtered && fullAttention.projects.length > 0 ? clearFilters : undefined}
    />
  ) : undefined;

  function renderAttentionCell(key: string, row: AttentionRow): ReactNode | undefined {
    switch (key) {
      case "nombre":
        if (row.kind === "tramo") {
          return (
            <span className="inline-flex items-center gap-2 font-semibold">
              <Dot color={row.color ?? "var(--muted-foreground)"} />
              {row.nombre}
            </span>
          );
        }
        // The task link comes from `rowHref` (GroupedTable wraps the first cell).
        return (
          <span title={row.nombre} className={LONG_TEXT}>
            {row.nombre}
          </span>
        );
      case "responsable":
        return row.responsable ?? "";
      case "estatus":
        if (row.kind === "tramo" || !row.estatus) return "";
        return (
          <span className="inline-flex items-center gap-1.5">
            {row.statusValue ? (
              <span aria-hidden="true" className={`inline-block size-[7px] rounded-full ${statusDotClass(statusColorToken({ status: row.statusValue }))}`} />
            ) : null}
            {row.estatus}
          </span>
        );
      case "vence":
        return row.vence ? <span className="text-destructive">{formatValue(row.vence, "date")}</span> : "";
      case "vencidas":
        return row.kind === "tramo" ? String(row.vencidas ?? 0) : "";
      case "dias":
        if (row.kind === "tramo") return String(row.diasTotal ?? 0);
        return row.dias === null ? "—" : <WithUnit value={String(row.dias)} unit={row.dias === 1 ? "día de retraso" : "días de retraso"} />;
      default:
        return undefined;
    }
  }

  // ── Ritmo semanal ──
  const paceRows: PaceRow[] = weeks.map((w) => ({
    id: w.weekStart,
    semana: weekLabel(w.weekStart),
    created: w.created,
    completed: w.completed,
    neto: w.completed - w.created,
  }));
  const paceEmpty = weeks.every((w) => w.created === 0 && w.completed === 0);

  function renderPaceCell(key: string, row: PaceRow): ReactNode | undefined {
    if (key !== "neto") return undefined;
    const text = signed(row.neto);
    return row.neto < 0 ? <span className="text-destructive">{text}</span> : text;
  }

  // ── Carga por persona ──
  const workloadRows: WorkloadRow[] = people.map((p) => ({
    id: p.id,
    persona: p.name,
    href: p.href ?? null,
    occupancy: p.occupancyPct ?? 0,
    abiertas: p.open,
    enProceso: p.inProgress ?? null,
    vencidas: p.overdue,
    pctVencidas: pctOf(p.overdue, p.open),
    retraso: daysText(p.avgDaysLate),
  }));

  function renderWorkloadCell(key: string, row: WorkloadRow): ReactNode | undefined {
    switch (key) {
      case "persona":
        return row.href ? (
          <Link href={row.href} title={row.persona} className={`${LONG_TEXT} font-medium underline decoration-border underline-offset-[3px]`}>
            {row.persona}
          </Link>
        ) : (
          <span title={row.persona} className={`${LONG_TEXT} font-medium`}>
            {row.persona}
          </span>
        );
      case "carga":
        return (
          <Bar
            pct={row.occupancy}
            width={160}
            color={row.occupancy >= 100 ? "var(--destructive)" : "var(--chart-1)"}
            label={`Ocupación ${row.occupancy} %`}
          />
        );
      case "pctVencidas":
        return row.pctVencidas === null ? "—" : <WithUnit value={`${row.pctVencidas} %`} unit="vencidas" />;
      default:
        return undefined;
    }
  }

  // ── Tareas abiertas por tramo ──
  const tramoRows: TramoRow[] = tramos.map((s) => ({
    id: s.key,
    tramo: s.label,
    color: s.colorVar,
    share: tramoSum.open > 0 ? (s.value / tramoSum.open) * 100 : 0,
    abiertas: s.value,
    vencidas: s.secondary ?? 0,
    pctVencidas: pctOf(s.secondary ?? 0, s.value),
    dias: s.value > 0 ? segmentDays(s).toFixed(1) : "—",
  }));

  function renderTramoCell(key: string, row: TramoRow): ReactNode | undefined {
    switch (key) {
      case "tramo":
        return (
          <span className="inline-flex items-center gap-2 font-medium">
            <Dot color={row.color} />
            {row.tramo}
          </span>
        );
      case "distribucion":
        return <Bar pct={row.share} width={200} color={row.color} label={`${Math.round(row.share)} % de las abiertas`} />;
      case "pctVencidas":
        return row.pctVencidas === null ? "—" : <WithUnit value={`${row.pctVencidas} %`} unit="vencidas" />;
      default:
        return undefined;
    }
  }

  // ── Agenda de hoy ──
  const agendaRows: AgendaRow[] = agenda.map((item) => {
    const info = item.tramo ? tramoInfo.get(item.tramo) : undefined;
    return {
      id: item.id,
      hora: agendaTime(item) ?? "—",
      actividad: item.title,
      href: item.href ?? null,
      proyecto: item.project ?? "—",
      tramo: info?.label ?? null,
      color: info?.colorVar ?? null,
      tipo: item.kind === "evento" ? "Evento" : "Entrega",
      responsable: item.assignee?.name ?? "—",
    };
  });
  const events = agenda.filter((a) => a.kind === "evento").length;

  function renderAgendaCell(key: string, row: AgendaRow): ReactNode | undefined {
    switch (key) {
      case "actividad":
        return row.href ? (
          <Link href={row.href} title={row.actividad} className={`${LONG_TEXT} underline decoration-border underline-offset-[3px]`}>
            {row.actividad}
          </Link>
        ) : (
          <span title={row.actividad} className={LONG_TEXT}>
            {row.actividad}
          </span>
        );
      case "proyecto":
        return (
          <span title={row.proyecto} className={LONG_TEXT}>
            {row.proyecto}
          </span>
        );
      case "tramo":
        return row.tramo ? (
          <span className="inline-flex items-center gap-2">
            <Dot color={row.color ?? "var(--muted-foreground)"} />
            {row.tramo}
          </span>
        ) : (
          "—"
        );
      default:
        return undefined;
    }
  }

  /** A section's message row: the no-match state when filters hide everything, else its empty copy. */
  function emptyRow(colSpan: number, empty: boolean, hadRows: boolean, emptyTitle: string): ReactNode | undefined {
    if (!empty) return undefined;
    const noMatch = filtered && hadRows;
    return <MessageRow colSpan={colSpan} title={noMatch ? NO_MATCH : emptyTitle} onClear={noMatch ? clearFilters : undefined} />;
  }

  // ── "Ir a" ──
  const netLast = lastWeekNet(weeks);
  const anchors: { section: keyof typeof ANALITICO_SECTION; label: string; count: string; tone: string }[] = [
    { section: "atencion", label: "Atención", count: String(attention.overdue), tone: "text-destructive" },
    {
      section: "ritmo",
      label: "Ritmo semanal",
      count: signed(netLast),
      tone: netLast < 0 ? "text-destructive" : "text-success",
    },
    ...(showWorkload
      ? [{ section: "carga" as const, label: "Carga por persona", count: String(people.length), tone: "text-muted-foreground" }]
      : []),
    { section: "tramos", label: "Por tramo", count: String(tramos.length), tone: "text-muted-foreground" },
    { section: "agenda", label: "Agenda", count: String(agenda.length), tone: "text-muted-foreground" },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={`${greetingFor(now)}, ${firstName}`}
        description={analiticoDescription(now, weekCount)}
        actions={
          <Link href="/tareas?nueva=1" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Nueva tarea
          </Link>
        }
      />

      <KpiStrip
        items={kpis.map((k) => ({
          key: k.key,
          label: k.label,
          value: k.value,
          ...(k.tone ? { tone: k.tone } : {}),
          ...(k.delta ? { delta: k.delta } : {}),
        }))}
      />

      <FilterCard
        groups={[{ id: "rango", label: "Rango", options: RANGE_OPTIONS, value: range }]}
        onChange={(groupId, value) => {
          if (groupId === "rango" && isDashboardRange(value)) setRange(value);
        }}
        extra={
          <div className="flex flex-1 flex-wrap items-center gap-4">
            <FilterSelect
              label="Responsable"
              value={filters.responsable}
              options={responsableOptions}
              onChange={(v) => setFilter("responsable", v)}
            />
            <FilterSelect label="Tramo" value={filters.tramo} options={tramoOptions} onChange={(v) => setFilter("tramo", v)} />
            <span className="flex-1" aria-hidden="true" />
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAll(true)}>
                Expandir todo
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>
                Contraer todo
              </Button>
            </div>
          </div>
        }
      />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <nav aria-label="Ir a sección" className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Ir a</span>
        {anchors.map((anchor) => (
          <a
            key={anchor.section}
            href={`#${ANALITICO_SECTION[anchor.section]}`}
            onClick={(event) => goTo(event, anchor.section)}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {anchor.label}
            <span className={`font-mono ${anchor.tone}`}>{anchor.count}</span>
          </a>
        ))}
      </nav>

      <div className="min-w-0">
        <GroupedTable<AttentionRow>
          toggleAll={false}
          label="Atención"
          columns={ATTENTION_COLUMNS}
          heat={ATTENTION_HEAT}
          groups={[
            {
              id: ANALITICO_SECTION.atencion,
              label: "Atención",
              caption: "por proyecto → tramo",
              metrics: [
                metric("vencidas", "Vencidas", attention.overdue, attention.overdue > 0 ? "destructive" : undefined),
                metric("bloqueadas", "Bloqueadas", attention.blocked),
                metric("dias", "Días de retraso", attention.daysLate),
              ],
              children: attentionEmpty ? undefined : attentionGroups,
              rows: attentionEmpty ? [] : undefined,
              quickAdd: attentionMessage,
              footer: attentionEmpty
                ? undefined
                : {
                    nombre: `Total · ${countLabel(attention.projects.length, "proyecto", "proyectos")}`,
                    vencidas: attention.overdue,
                    dias: attention.daysLate,
                  },
            },
          ]}
          expanded={[...(isOpen("atencion") ? [ANALITICO_SECTION.atencion] : []), ...expandedProjects]}
          onExpandedChange={(ids) => {
            onSectionExpanded("atencion", ids);
            setOpenProjects(ids.filter((id) => id !== ANALITICO_SECTION.atencion));
          }}
          getRowId={(row) => row.id}
          renderCell={renderAttentionCell}
          rowHref={(row) => row.href}
          onLoadMore={(projectId) =>
            setTaskLimits((limits) => ({ ...limits, [projectId]: (limits[projectId] ?? ATTENTION_PAGE_SIZE) + ATTENTION_PAGE_SIZE }))
          }
        />
      </div>

      <div className="min-w-0">
        <GroupedTable<PaceRow>
          toggleAll={false}
          label="Ritmo semanal"
          columns={PACE_COLUMNS}
          heat={PACE_HEAT}
          groups={[
            {
              id: ANALITICO_SECTION.ritmo,
              label: "Ritmo semanal",
              caption: countLabel(weekCount, "semana", "semanas"),
              metrics: [
                metric("creadas", "Creadas", pace.created),
                metric("completadas", "Completadas", pace.completed),
                metric("neto", "Neto", signed(pace.net), pace.net < 0 ? "destructive" : undefined),
              ],
              rows: paceEmpty ? [] : paceRows,
              quickAdd: paceEmpty ? <MessageRow colSpan={PACE_COLUMNS.length} title="Sin movimiento en el rango" /> : undefined,
              footer: paceEmpty
                ? undefined
                : { semana: "Total", created: pace.created, completed: pace.completed, neto: signed(pace.net) },
            },
          ]}
          expanded={isOpen("ritmo") ? [ANALITICO_SECTION.ritmo] : []}
          onExpandedChange={(ids) => onSectionExpanded("ritmo", ids)}
          getRowId={(row) => row.id}
          renderCell={renderPaceCell}
        />
        {isOpen("ritmo") && !paceEmpty ? (
          <div className="mt-3">
            <LineSeriesWidget
              title="Creadas y completadas por semana"
              view="chart"
              points={weeks.map((w) => ({
                key: w.weekStart,
                label: weekLabel(w.weekStart).toLocaleUpperCase("es-MX"),
                values: { completed: w.completed, created: w.created },
              }))}
              series={PACE_SERIES}
              table={{ columns: PACE_COLUMNS, rows: paceRows }}
              emptyText="Sin movimiento en el rango"
            />
          </div>
        ) : null}
      </div>

      {showWorkload ? (
        <div className="min-w-0">
          <GroupedTable<WorkloadRow>
            toggleAll={false}
            label="Carga por persona"
            columns={WORKLOAD_COLUMNS}
            heat={[SHARE_HEAT_RULE]}
            groups={[
              {
                id: ANALITICO_SECTION.carga,
                label: "Carga por persona",
                caption: countLabel(people.length, "persona", "personas"),
                metrics: [
                  metric("abiertas", "Abiertas", workload.open),
                  metric("saturadas", "Saturadas", workload.saturated, workload.saturated > 0 ? "destructive" : undefined),
                ],
                rows: workloadRows,
                quickAdd: emptyRow(WORKLOAD_COLUMNS.length, people.length === 0, data.workload.length > 0, "Sin tareas asignadas"),
                footer:
                  people.length === 0
                    ? undefined
                    : {
                        persona: `Total · ${countLabel(people.length, "persona", "personas")}`,
                        carga: "",
                        abiertas: workload.open,
                        enProceso: workload.inProgress,
                        vencidas: workload.overdue,
                        pctVencidas: workload.overduePct === null ? "—" : `${workload.overduePct} %`,
                        retraso: daysText(workload.avgDaysLate),
                      },
              },
            ]}
            expanded={isOpen("carga") ? [ANALITICO_SECTION.carga] : []}
            onExpandedChange={(ids) => onSectionExpanded("carga", ids)}
            getRowId={(row) => row.id}
            renderCell={renderWorkloadCell}
          />
        </div>
      ) : null}

      <div className="min-w-0">
        <GroupedTable<TramoRow>
          toggleAll={false}
          label="Tareas abiertas por tramo"
          columns={TRAMO_COLUMNS}
          heat={[SHARE_HEAT_RULE]}
          groups={[
            {
              id: ANALITICO_SECTION.tramos,
              label: "Tareas abiertas por tramo",
              caption: countLabel(tramos.length, "tramo", "tramos"),
              metrics: [metric("abiertas", "Abiertas", tramoSum.open)],
              rows: tramoRows,
              quickAdd: emptyRow(TRAMO_COLUMNS.length, tramos.length === 0, allTramoOpen > 0, "Sin tareas abiertas"),
              footer:
                tramos.length === 0
                  ? undefined
                  : {
                      tramo: `Total · ${countLabel(tramos.length, "tramo", "tramos")}`,
                      distribucion: "",
                      abiertas: tramoSum.open,
                      vencidas: tramoSum.overdue,
                      pctVencidas: tramoSum.overduePct === null ? "—" : `${tramoSum.overduePct} %`,
                      dias: tramoSum.avgDays === null ? "—" : tramoSum.avgDays.toFixed(1),
                    },
            },
          ]}
          expanded={isOpen("tramos") ? [ANALITICO_SECTION.tramos] : []}
          onExpandedChange={(ids) => onSectionExpanded("tramos", ids)}
          getRowId={(row) => row.id}
          renderCell={renderTramoCell}
        />
      </div>

      <div className="min-w-0">
        <GroupedTable<AgendaRow>
          toggleAll={false}
          label="Agenda de hoy"
          columns={AGENDA_COLUMNS}
          groups={[
            {
              id: ANALITICO_SECTION.agenda,
              label: "Agenda de hoy",
              caption: agendaDayLabel(now),
              metrics: [metric("eventos", "Eventos", events), metric("entregas", "Entregas", agenda.length - events)],
              rows: agendaRows,
              quickAdd: emptyRow(
                AGENDA_COLUMNS.length,
                agenda.length === 0,
                data.todayAgenda.length > 0,
                "Sin eventos ni entregas hoy",
              ),
            },
          ]}
          expanded={isOpen("agenda") ? [ANALITICO_SECTION.agenda] : []}
          onExpandedChange={(ids) => onSectionExpanded("agenda", ids)}
          getRowId={(row) => row.id}
          renderCell={renderAgendaCell}
        />
      </div>
    </div>
  );
}

/** "RESPONSABLE Todos ▾": a labelled Select with "Todos" for null. */
function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: readonly (readonly [string, string])[];
  onChange(value: string | null): void;
}) {
  const items = { [ALL]: "Todos", ...Object.fromEntries(options) };
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <Select items={items} value={value ?? ALL} onValueChange={(v) => onChange(!v || v === ALL ? null : (v as string))}>
        <SelectTrigger aria-label={label} className="h-[30px] w-auto min-w-28 rounded-[10px] text-[12.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map(([id, name]) => (
            <SelectItem key={id} value={id}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
