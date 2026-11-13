/**
 * Proyecto · Resumen task counts from the server (#1051). Pure and
 * client-safe: `qk.proyectos.resumenSummary(id)` carries SQL aggregates of
 * the project's tasks (per etapa and fase, per Responsable and etapa) plus
 * the few "Lo que sigue" rows, and these functions turn them into the same
 * shapes the three Resumen layouts render (`project-summary.ts` derives them
 * from task rows; the numbers are the same). Counts read top-level tasks
 * (subtasks count on their parent), as before.
 */
import type { PresentationStyle } from "@/lib/types/redesign";
import type { Group, GroupMetric } from "@/components/widgets/GroupedTable";
import type { KpiStripItem } from "@/components/widgets/KpiStrip";
import type { TareasListFilters } from "@/lib/query/keys";
import {
  RESUMEN_ADMIN_GROUP,
  RESUMEN_SIN_FASE,
  STATUS_ORDER,
  daysBetween,
  loadToneOf,
  shortDate,
  startedEtapas,
  etapaRunState,
  type NextTask,
  type PhaseRow,
  type ProjectSummaryInput,
  type StatusCount,
  type TeamLoadCard,
  type TeamLoadRow,
  type EtapaProgress,
} from "@/lib/proyectos/project-summary";
import { initialsOf } from "@/lib/people/aggregates";
import { SIN_ETAPA_KEY } from "@/lib/tareas/summary";
import type { ProjectDetail, StaffRef, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

/**
 * The top-level tasks of one etapa and fase (`workflow` / `phase` null: none).
 * "Open" is any status but completado and "overdue" an open task whose
 * commitment date is before today, as the Resumen counted them; "closed" is
 * `isTaskClosed` (completado or a custom status that closes), what "Ocultar
 * completadas" leaves out. The `shown*` counts leave the closed tasks out.
 */
export type ResumenPhaseBucket = {
  workflow: WorkflowRef | null;
  phase: WorkflowPhaseRef | null;
  total: number;
  done: number;
  closed: number;
  pendiente: number;
  enProceso: number;
  blocked: number;
  overdue: number;
  /** Σ days late of the overdue tasks. */
  daysLateSum: number;
  shownOverdue: number;
  shownDaysLateSum: number;
  shownBlocked: number;
  /** YYYY-MM-DD: earliest / latest commitment date. */
  earliestDue: string | null;
  latestDue: string | null;
  /** YYYY-MM-DD (UTC): earliest creation, latest close. */
  earliestCreated: string | null;
  latestClosed: string | null;
};

/** One Responsable's tasks in one etapa (`workflow` null: none). */
export type ResumenManagerBucket = {
  staffId: string;
  workflow: WorkflowRef | null;
  /** Every task, subtasks included (the Esencial avatar tint). */
  all: number;
  /** Top-level tasks. */
  live: number;
  liveOpen: number;
  liveOverdue: number;
  liveBlocked: number;
};

/** `qk.proyectos.resumenSummary(id)`: every task number the Resumen shows. */
export type ResumenTareasSummary = {
  /** `activities.canViewActivities`: without it every count is zero and no rows load. */
  canViewTasks: boolean;
  /** `canSeeAdminData`: the counts include the admin tasks (the "Administración" group). */
  includeAdmin: boolean;
  /** YYYY-MM-DD (America/Mexico_City): the day the counts were taken. */
  today: string;
  buckets: ResumenPhaseBucket[];
  managers: ResumenManagerBucket[];
  /** "Lo que sigue": the most urgent open tasks (`nextTasks` order), at most `RESUMEN_NEXT_LIMIT`. */
  next: NextTask[];
  /** The newest open tasks (newest first), at most `RESUMEN_RECENT_LIMIT`: a just-created task leads "Lo que sigue". */
  recent: NextTask[];
};

export const RESUMEN_NEXT_LIMIT = 5;
export const RESUMEN_RECENT_LIMIT = 4;

export const EMPTY_RESUMEN_SUMMARY: ResumenTareasSummary = {
  canViewTasks: false,
  includeAdmin: false,
  today: "",
  buckets: [],
  managers: [],
  next: [],
  recent: [],
};

const ONE_DECIMAL = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function pctOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

type Totals = Omit<ResumenPhaseBucket, "workflow" | "phase">;

const ZERO: Totals = {
  total: 0,
  done: 0,
  closed: 0,
  pendiente: 0,
  enProceso: 0,
  blocked: 0,
  overdue: 0,
  daysLateSum: 0,
  shownOverdue: 0,
  shownDaysLateSum: 0,
  shownBlocked: 0,
  earliestDue: null,
  latestDue: null,
  earliestCreated: null,
  latestClosed: null,
};

const minDate = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : b < a ? b : a);
const maxDate = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : b > a ? b : a);

/** The buckets added up. */
export function sumBuckets(buckets: readonly Totals[]): Totals {
  return buckets.reduce<Totals>(
    (acc, b) => ({
      total: acc.total + b.total,
      done: acc.done + b.done,
      closed: acc.closed + b.closed,
      pendiente: acc.pendiente + b.pendiente,
      enProceso: acc.enProceso + b.enProceso,
      blocked: acc.blocked + b.blocked,
      overdue: acc.overdue + b.overdue,
      daysLateSum: acc.daysLateSum + b.daysLateSum,
      shownOverdue: acc.shownOverdue + b.shownOverdue,
      shownDaysLateSum: acc.shownDaysLateSum + b.shownDaysLateSum,
      shownBlocked: acc.shownBlocked + b.shownBlocked,
      earliestDue: minDate(acc.earliestDue, b.earliestDue),
      latestDue: maxDate(acc.latestDue, b.latestDue),
      earliestCreated: minDate(acc.earliestCreated, b.earliestCreated),
      latestClosed: maxDate(acc.latestClosed, b.latestClosed),
    }),
    ZERO,
  );
}

/** The buckets of one etapa (`null`: without etapa). */
function bucketsOf(summary: Pick<ResumenTareasSummary, "buckets">, workflowId: string | null): ResumenPhaseBucket[] {
  return summary.buckets.filter((b) => (b.workflow?.id ?? null) === workflowId);
}

/** Per etapa id ("" = without etapa): the etapa and its totals, in etapa order. */
function etapaTotals(summary: Pick<ResumenTareasSummary, "buckets">): Map<string, { workflow: WorkflowRef | null; totals: Totals }> {
  const out = new Map<string, { workflow: WorkflowRef | null; parts: ResumenPhaseBucket[] }>();
  for (const b of summary.buckets) {
    const id = b.workflow?.id ?? "";
    const entry = out.get(id) ?? { workflow: b.workflow, parts: [] };
    entry.parts.push(b);
    out.set(id, entry);
  }
  return new Map([...out].map(([id, e]) => [id, { workflow: e.workflow, totals: sumBuckets(e.parts) }]));
}

/** The etapa with the most tasks by `count`; a tie goes to the earlier etapa. */
function dominantOf(rows: ResumenManagerBucket[], count: (row: ResumenManagerBucket) => number, pick: (w: WorkflowRef) => string) {
  let best: { value: string; n: number } | null = null;
  const ordered = [...rows].filter((r) => r.workflow && count(r) > 0).sort((a, b) => a.workflow!.sortOrder - b.workflow!.sortOrder);
  for (const row of ordered) {
    const n = count(row);
    if (!best || n > best.n) best = { value: pick(row.workflow!), n };
  }
  return best?.value ?? null;
}

function managerRows(summary: Pick<ResumenTareasSummary, "managers">, staffId: string): ResumenManagerBucket[] {
  return summary.managers.filter((m) => m.staffId === staffId);
}

const sumOf = (rows: ResumenManagerBucket[], pick: (row: ResumenManagerBucket) => number) => rows.reduce((acc, r) => acc + pick(r), 0);

// ── Visual and Esencial ──────────────────────────────────────────────────────

/** `etapaProgress` from the summary: one row per started etapa. */
export function resumenEtapaProgress(
  summary: Pick<ResumenTareasSummary, "buckets">,
  catalog: WorkflowRef[],
  project: ProjectDetail,
): EtapaProgress[] {
  const started = new Map(project.etapas.map((t) => [t.id, t]));
  const totals = etapaTotals(summary);
  return startedEtapas(catalog, project).map((etapa) => {
    const run = started.get(etapa.id) ?? null;
    const state = etapaRunState(project, etapa);
    const own = totals.get(etapa.id)?.totals ?? ZERO;
    return {
      etapaId: etapa.id,
      key: etapa.key || etapa.id,
      label: etapa.name,
      state,
      pct: own.total > 0 ? Math.round((own.done / own.total) * 100) : 0,
      open: own.total - own.done,
      overdue: own.overdue,
      total: own.total,
      startsOn: state === "next" ? own.earliestDue : (run?.startedAt?.slice(0, 10) ?? own.earliestDue),
    };
  });
}

/** `statusCounts` from the summary: tasks per base status in the donut order. */
export function resumenStatusCounts(summary: Pick<ResumenTareasSummary, "buckets">): StatusCount[] {
  const all = sumBuckets(summary.buckets);
  const by: Record<string, number> = {
    pendiente: all.pendiente,
    en_proceso: all.enProceso,
    bloqueado: all.blocked,
    completado: all.done,
  };
  return STATUS_ORDER.map(({ status, label }) => ({ status, label, count: by[status] ?? 0 }));
}

/** The Visual hero chips: open tasks, the overdue ones and the blocked ones. */
export function resumenHeroCounts(summary: Pick<ResumenTareasSummary, "buckets">): { open: number; overdue: number; blocked: number } {
  const all = sumBuckets(summary.buckets);
  return { open: all.total - all.done, overdue: all.overdue, blocked: all.blocked };
}

/**
 * Visual "Lo que sigue": the tasks just created (`recentIds`) first, in the
 * urgency order, then the most urgent ones, at most `limit`.
 */
export function resumenNextCards(
  summary: Pick<ResumenTareasSummary, "next" | "recent">,
  recentIds: readonly string[],
  limit: number,
): NextTask[] {
  const recent = new Set(recentIds);
  const byId = new Map<string, NextTask>();
  for (const task of [...summary.next, ...summary.recent]) if (!byId.has(task.id)) byId.set(task.id, task);
  const urgent = (t: NextTask) => t.blocked || t.daysLate > 0;
  const order = (a: NextTask, b: NextTask) => {
    if (urgent(a) !== urgent(b)) return urgent(a) ? -1 : 1;
    if (urgent(a) && a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.title.localeCompare(b.title, "es");
  };
  const fresh = [...byId.values()].filter((t) => recent.has(t.id)).sort(order);
  return [...fresh, ...summary.next.filter((t) => !recent.has(t.id))].slice(0, Math.max(0, limit));
}

/** `teamLoadCards` from the summary. */
export function resumenTeamLoadCards(
  input: Pick<ProjectSummaryInput, "project" | "staff" | "teamLoad">,
  summary: Pick<ResumenTareasSummary, "managers">,
): TeamLoadCard[] {
  const { project, staff, teamLoad } = input;
  const people = new Map<string, string>();
  const add = (person: StaffRef | null) => {
    if (person && !people.has(person.id)) people.set(person.id, staff[person.id]?.name ?? person.name);
  };
  add(project.manager);
  add(project.coordinator);
  for (const member of project.members) if (member.active !== false) add(member);

  return [...people.entries()].map(([id, name]) => {
    const rows = managerRows(summary, id);
    return {
      id,
      name,
      initials: initialsOf(name),
      loadPct: teamLoad[id]?.loadPct ?? 0,
      overdueHere: sumOf(rows, (r) => r.liveOverdue),
      blockedHere: sumOf(rows, (r) => r.liveBlocked),
      etapaKey: dominantOf(rows, (r) => r.live, (w) => w.key),
    };
  });
}

/** The Esencial avatar tint: the etapa key where the person has the most tasks (subtasks included). */
export function resumenAvatarEtapa(summary: Pick<ResumenTareasSummary, "managers">, staffId: string): string | null {
  return dominantOf(managerRows(summary, staffId), (r) => r.all, (w) => w.key);
}

// ── Analítico ────────────────────────────────────────────────────────────────

/** The current fase: the first fase (by `sortOrder`) of the current etapa with open tasks. */
function currentPhaseIdOf(summary: Pick<ResumenTareasSummary, "buckets">, project: ProjectDetail): string | null {
  const candidates = summary.buckets
    .filter(
      (b) =>
        b.phase !== null &&
        b.total - b.done > 0 &&
        (project.currentWorkflowId === null || (b.workflow?.id ?? null) === project.currentWorkflowId),
    )
    .sort((a, b) => a.phase!.sortOrder - b.phase!.sortOrder || (a.workflow?.sortOrder ?? 2147483647) - (b.workflow?.sortOrder ?? 2147483647));
  return candidates[0]?.phase?.id ?? null;
}

function phaseRowOf(phaseId: string | null, name: string, current: boolean, t: Totals, today: string): PhaseRow {
  const open = t.total - t.done;
  const endPlan = t.latestDue;
  const start = endPlan === null || t.total === 0 ? null : t.earliestCreated;
  let deviationDays: number | null = null;
  if (endPlan !== null) {
    if (open > 0) deviationDays = today > endPlan ? daysBetween(endPlan, today) : 0;
    else deviationDays = t.latestClosed !== null && t.latestClosed > endPlan ? daysBetween(endPlan, t.latestClosed) : 0;
  }
  return {
    phaseId,
    name,
    current,
    tasks: t.total,
    open,
    overdue: t.overdue,
    pct: pctOf(t.done, t.total),
    start,
    endPlan,
    deviationDays,
  };
}

const ETAPA_STATE_LABEL = { done: "cerrado", current: "en curso", next: "sin iniciar" } as const;

/** `etapaPhaseGroups` ("Etapas y fases") from the summary. */
export function resumenPhaseGroups(
  summary: Pick<ResumenTareasSummary, "buckets">,
  catalog: WorkflowRef[],
  phasesByEtapa: Record<string, WorkflowPhaseRef[]>,
  project: ProjectDetail,
  today: string,
): { groups: Group<PhaseRow>[]; totals: Record<string, string> } {
  const currentPhaseId = currentPhaseIdOf(summary, project);
  const allRows: PhaseRow[] = [];

  const groups = startedEtapas(catalog, project).map((etapa): Group<PhaseRow> => {
    const inEtapa = bucketsOf(summary, etapa.id);
    const byPhase = new Map(inEtapa.filter((b) => b.phase).map((b) => [b.phase!.id, b]));
    const known = [...(phasesByEtapa[etapa.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const knownIds = new Set(known.map((p) => p.id));
    const extra = inEtapa
      .filter((b) => b.phase && !knownIds.has(b.phase.id))
      .map((b) => b.phase!)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const rows = [...known, ...extra].map((phase) =>
      phaseRowOf(phase.id, phase.name, phase.id === currentPhaseId, byPhase.get(phase.id) ?? ZERO, today),
    );
    const unphased = inEtapa.find((b) => b.phase === null);
    if (unphased && unphased.total > 0) rows.push(phaseRowOf(null, RESUMEN_SIN_FASE, false, unphased, today));
    allRows.push(...rows);

    const state = etapaRunState(project, etapa);
    const t = sumBuckets(inEtapa);
    const open = t.total - t.done;
    const pct = pctOf(t.total - open, t.total);
    return {
      id: etapa.id,
      label: etapa.name,
      caption: countLabel(rows.length, "fase", "fases"),
      metrics: [
        ...(state === "current" ? [{ key: "actual", value: "actual", pill: true }] : []),
        state === "done" && open > 0
          ? { key: "estado", value: `cerrado con ${open} pendiente`, tone: "warning" as const }
          : { key: "estado", value: `${ETAPA_STATE_LABEL[state]} ${pct} %` },
        { key: "tareas", value: countLabel(t.total, "tarea", "tareas") },
        {
          key: "vencidas",
          value: countLabel(t.overdue, "vencida", "vencidas"),
          tone: t.overdue > 0 ? ("destructive" as const) : ("muted" as const),
        },
        ...(t.blocked > 0
          ? [{ key: "bloqueadas", value: countLabel(t.blocked, "bloqueada", "bloqueadas"), tone: "destructive" as const }]
          : []),
      ],
      rows,
    };
  });

  const sum = (key: "tasks" | "open" | "overdue") => allRows.reduce((acc, row) => acc + row[key], 0);
  const starts = allRows.flatMap((row) => (row.start ? [row.start] : [])).sort();
  const ends = allRows.flatMap((row) => (row.endPlan ? [row.endPlan] : [])).sort();
  const deviations = allRows.flatMap((row) => (row.deviationDays !== null ? [row.deviationDays] : []));
  const maxDeviation = deviations.length > 0 ? Math.max(...deviations) : null;
  const totalTasks = sum("tasks");

  return {
    groups,
    totals: {
      name: `Total · ${countLabel(allRows.length, "fase", "fases")}`,
      tasks: String(totalTasks),
      open: String(sum("open")),
      overdue: String(sum("overdue")),
      pct: `${pctOf(totalTasks - sum("open"), totalTasks)} %`,
      start: starts[0] ? shortDate(starts[0]) : "—",
      endPlan: ends.length > 0 ? shortDate(ends[ends.length - 1]!) : "—",
      deviationDays: maxDeviation === null ? "—" : maxDeviation > 0 ? `+${maxDeviation} máx.` : "0",
    },
  };
}

/** One "Tareas por etapa" group without its rows (they page in through `qk.tareas.list`). */
export type ResumenTaskGroup = {
  /** The etapa id, or "admin" for the tasks without etapa. */
  id: string;
  label: string;
  /** The etapa; null for "Administración". */
  etapa: WorkflowRef | null;
  caption: string;
  metrics: GroupMetric[];
  /** Rows the group lists (closed ones left out when hiding them). */
  count: number;
  /** Closed tasks "Ocultar completadas" leaves out of it. */
  hidden: number;
};

/**
 * `taskGroupsByEtapa` ("Tareas por etapa") from the summary, without rows:
 * started etapas (also empty), then etapas not started that have tasks, then
 * "Administración". Groups with overdue tasks first by Σ days late. With
 * `hideCompleted` the counts leave the closed tasks out, as the table does.
 * Also the header numbers ("{n} tareas · {k} abiertas · {v} vencidas").
 */
export function resumenTaskGroups(
  summary: Pick<ResumenTareasSummary, "buckets">,
  catalog: WorkflowRef[],
  project: Pick<ProjectDetail, "etapas">,
  hideCompleted: boolean,
): {
  groups: ResumenTaskGroup[];
  totals: Record<string, string>;
  shown: number;
  open: number;
  overdue: number;
  /** Every top-level task, closed ones included (the CSV export shows with any). */
  all: number;
} {
  const totals = etapaTotals(summary);
  const shownOf = (t: Totals) => (hideCompleted ? t.total - t.closed : t.total);
  const etapas = startedEtapas(catalog, project);
  const known = new Set(etapas.map((t) => t.id));
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const extra = [...totals.entries()]
    .filter(([id, e]) => id !== "" && !known.has(id) && shownOf(e.totals) > 0)
    .flatMap(([id, e]) => {
      const ref = byId.get(id) ?? e.workflow;
      return ref ? [ref] : [];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const buckets: { id: string; label: string; etapa: WorkflowRef | null; t: Totals }[] = [...etapas, ...extra].map((etapa) => ({
    id: etapa.id,
    label: etapa.name,
    etapa,
    t: totals.get(etapa.id)?.totals ?? ZERO,
  }));
  const admin = totals.get("")?.totals;
  if (admin && shownOf(admin) > 0) buckets.push({ id: "admin", label: RESUMEN_ADMIN_GROUP, etapa: null, t: admin });

  const built = buckets.map((bucket, index) => {
    const { t } = bucket;
    const count = shownOf(t);
    const late = hideCompleted ? t.shownOverdue : t.overdue;
    const daysSum = hideCompleted ? t.shownDaysLateSum : t.daysLateSum;
    const blocked = (hideCompleted ? t.shownBlocked : t.blocked) > 0;
    const group: ResumenTaskGroup = {
      id: bucket.id,
      label: bucket.label,
      etapa: bucket.etapa,
      caption: countLabel(count, "tarea", "tareas"),
      metrics: [
        ...(late > 0 ? [{ key: "vencidas", value: `${countLabel(late, "vencida", "vencidas")} · ${daysSum} d`, tone: "destructive" as const }] : []),
        ...(blocked ? [{ key: "bloqueada", value: "bloqueada", tone: "destructive" as const }] : []),
      ],
      count,
      hidden: hideCompleted ? t.closed : 0,
    };
    return { group, index, daysSum, late };
  });

  built.sort((a, b) => {
    const aLate = a.late > 0 ? 0 : 1;
    const bLate = b.late > 0 ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    if (aLate === 0 && a.daysSum !== b.daysSum) return b.daysSum - a.daysSum;
    return a.index - b.index;
  });

  const all = sumBuckets(summary.buckets);
  const shown = hideCompleted ? all.total - all.closed : all.total;
  const daysTotal = built.reduce((acc, b) => acc + b.daysSum, 0);
  return {
    groups: built.map((b) => b.group),
    totals: { title: `Total · ${countLabel(shown, "tarea", "tareas")}`, daysLate: String(daysTotal) },
    shown,
    // Not closed implies not completado; without hiding, open is "not completado".
    open: hideCompleted ? shown : all.total - all.done,
    overdue: hideCompleted ? all.shownOverdue : all.overdue,
    all: all.total,
  };
}

/**
 * The `qk.tareas.list` filters of one "Tareas por etapa" group: the project,
 * the group's etapa (or the tasks without one, with the admin tasks for an
 * administrator), "Ocultar completadas" and the overdue-first order.
 */
export function resumenGroupListFilters(
  projectId: string,
  etapaKey: string | null,
  options: { hideCompleted: boolean; includeAdmin: boolean },
): TareasListFilters {
  return {
    etapa: etapaKey ?? SIN_ETAPA_KEY,
    proyecto: projectId,
    responsable: null,
    estado: null,
    q: null,
    ...(options.hideCompleted ? { mostrar: "abiertas" as const } : {}),
    orderBy: "retraso",
    ...(options.includeAdmin && etapaKey === null ? { incluirAdmin: true as const } : {}),
  };
}

/** Every "Tareas por etapa" group with rows, as `{ id, filters }` (the page prefetches their first pages). */
export function resumenGroupLists(
  data: Pick<ProjectSummaryInput, "project" | "etapaCatalog">,
  summary: ResumenTareasSummary,
  hideCompleted: boolean,
): { id: string; count: number; filters: TareasListFilters }[] {
  if (!summary.canViewTasks) return [];
  return resumenTaskGroups(summary, data.etapaCatalog, data.project, hideCompleted)
    .groups.filter((g) => g.count > 0)
    .map((g) => ({
      id: g.id,
      count: g.count,
      filters: resumenGroupListFilters(data.project.id, g.etapa?.key ?? null, { hideCompleted, includeAdmin: summary.includeAdmin }),
    }));
}

/**
 * The groups whose first page the page prefetches for the style it renders:
 * every group with rows in Analítico ("Tareas por etapa" is an Analítico
 * table), none in Visual and Esencial.
 */
export function resumenPrefetchLists(
  style: PresentationStyle,
  data: Pick<ProjectSummaryInput, "project" | "etapaCatalog">,
  summary: ResumenTareasSummary,
  hideCompleted: boolean,
): { id: string; count: number; filters: TareasListFilters }[] {
  return style === "analitico" ? resumenGroupLists(data, summary, hideCompleted) : [];
}

/** `resumenKpis` from the summary. */
export function resumenKpisOf(input: ProjectSummaryInput, summary: Pick<ResumenTareasSummary, "buckets">): KpiStripItem[] {
  const { project, portfolio, schedule, showBudget } = input;
  const all = sumBuckets(summary.buckets);
  const open = all.total - all.done;
  const overdue = all.overdue;
  const real = Math.round(portfolio?.real ?? project.progress);
  const plan = schedule && portfolio?.plan != null ? Math.round(portfolio.plan) : null;

  const items: KpiStripItem[] = [];

  const deviation = plan !== null ? real - plan : null;
  items.push({
    key: "avance",
    label: "Avance",
    value: `${real} %`,
    ...(deviation !== null
      ? {
          delta: {
            label: `${signed(deviation)} pts vs plan (${plan} %)`,
            tone: deviation < 0 ? ("bad" as const) : deviation > 0 ? ("good" as const) : ("neutral" as const),
          },
        }
      : {}),
  });

  const weekAgoOpen = portfolio && portfolio.series7.length > 0 ? portfolio.series7[0]! : null;
  items.push({
    key: "abiertas",
    label: "Tareas abiertas",
    value: open,
    secondary: `de ${all.total}`,
    ...(weekAgoOpen !== null ? { delta: { label: `${signed(open - weekAgoOpen)} esta semana`, tone: "neutral" as const } } : {}),
  });

  const overdueChange = portfolio ? overdue - portfolio.overdueWeekAgo : null;
  items.push({
    key: "vencidas",
    label: "Vencidas",
    value: overdue,
    secondary: `· ${pctOf(overdue, open)} %`,
    tone: overdue > 0 ? "destructive" : "default",
    ...(overdueChange !== null
      ? {
          delta: {
            label: `${signed(overdueChange)} vs semana pasada`,
            tone: overdueChange > 0 ? ("bad" as const) : overdueChange < 0 ? ("good" as const) : ("neutral" as const),
          },
        }
      : {}),
  });

  const avgDelay = portfolio?.avgDelayDays ?? (overdue > 0 ? Math.round((all.daysLateSum / overdue) * 10) / 10 : null);
  const avgWeekAgo = portfolio?.avgDelayWeekAgo ?? null;
  const delayChange = avgDelay !== null && avgWeekAgo !== null ? Math.round((avgDelay - avgWeekAgo) * 10) / 10 : null;
  items.push({
    key: "retraso",
    label: "Retraso promedio",
    value: avgDelay !== null ? `${ONE_DECIMAL.format(avgDelay)} d` : "—",
    delta:
      delayChange === null || delayChange === 0
        ? { label: "sin cambio", tone: "neutral" }
        : { label: `${delayChange > 0 ? "+" : ""}${ONE_DECIMAL.format(delayChange)} d`, tone: delayChange > 0 ? "bad" : "good" },
  });

  const budget = showBudget ? (portfolio?.budgetSpentPct ?? null) : null;
  if (budget !== null) {
    const spent = Math.round(budget);
    const gap = real - spent;
    items.push({
      key: "presupuesto",
      label: "Presup. ejercido",
      value: `${spent} %`,
      secondary: "Admin",
      delta:
        gap >= 0
          ? { label: `${gap} pts bajo el avance`, tone: gap > 0 ? "good" : "neutral" }
          : { label: `${-gap} pts sobre el avance`, tone: "bad" },
    });
  }

  return items;
}

/** `teamLoadRows` ("Carga del equipo") from the summary. */
export function resumenTeamLoadRows(input: ProjectSummaryInput, summary: Pick<ResumenTareasSummary, "managers">): TeamLoadRow[] {
  const { project, staff } = input;
  const people = new Map<string, { name: string; role: string | null }>();
  const add = (person: { id: string; name: string } | null, role: string | null) => {
    if (person && !people.has(person.id)) people.set(person.id, { name: person.name, role });
  };
  add(project.manager, "responsable");
  add(project.coordinator, "coordinación");
  for (const member of project.members) if (member.active !== false) add(member, member.role?.trim() || null);

  const load = input.teamLoad;
  const rows = [...people.entries()].map(([staffId, person]): TeamLoadRow => {
    const mine = managerRows(summary, staffId);
    const dominant = dominantOf(mine, (r) => r.liveOpen, (w) => w.name);
    const role = person.role ?? staff[staffId]?.puesto ?? null;
    const loadPct = Math.round(load[staffId]?.loadPct ?? 0);
    return {
      staffId,
      name: staff[staffId]?.name || person.name,
      context: [dominant, role].filter(Boolean).join(" · "),
      here: sumOf(mine, (r) => r.liveOpen),
      overdueHere: sumOf(mine, (r) => r.liveOverdue),
      loadPct,
      tone: loadToneOf(loadPct),
    };
  });
  return rows.sort((a, b) => b.loadPct - a.loadPct || a.name.localeCompare(b.name, "es"));
}
