/**
 * Mi espacio task counts and list filters (#1051). The summary
 * (`qk.me.tasksSummary(input)`) counts my open tasks in one grouped SQL
 * statement (`tasksRepository.myTaskSummary`), so every KPI, chip, column
 * count and group header is right however many tasks there are; the rows
 * load 30 a page per group, column or project card (`qk.me.tasksList(f)`).
 * Pure and client-safe.
 *
 * The date rules are Mi espacio's own (`dueInfo`, `bucketMyTasks`): the
 * commitment date only, "today" in America/Mexico_City.
 * - overdue: open and committed before today;
 * - Hoy: committed today or before; Esta semana: tomorrow … Sunday;
 *   Después: later or undated.
 */
import type { Group } from "@/components/widgets/GroupedTable";
import { SIN_TRAMO_KEY } from "@/lib/tareas/summary";
import { TASK_LIST_PAGE_SIZE } from "@/lib/tareas/page-data";
import { addDays } from "@/lib/time-tracking/local-time";
import { tramoColorVar } from "@/lib/tramos/tramo-color";

import { SIN_TRAMO, sundayOf, tramoGroupId, type MyTaskBucket, type TaskRow } from "./my-tasks";

/** The Analítico filters the summary narrows by (the URL's `?tramo=`, `?q=`, `?estado=retraso`). */
export type MyTasksSummaryInput = {
  /** A tramo key; null = every tramo. */
  tramo: string | null;
  /** The search, trimmed; null = none. */
  q: string | null;
  /** `?estado=retraso`: overdue tasks only. Left out otherwise. */
  retraso?: true;
};

/** Counts of one group (or of everything the filters match). */
export type MyTasksCounts = {
  /** Open tasks that match. */
  open: number;
  overdue: number;
  /** Open and blocked. */
  blocked: number;
  /** Days late of the overdue tasks, summed. */
  daysLateSum: number;
  maxDaysLate: number;
  /** Closed tasks that match (listed with "Ocultar completadas" off). */
  closed: number;
};

export type MyTasksSummaryTramo = MyTasksCounts & {
  /** `id: null` = "Sin tramo", sorted last. */
  tramo: { id: string | null; key: string | null; name: string; sortOrder: number };
};

export type MyTasksSummaryProject = MyTasksCounts & {
  project: { id: string; name: string };
  tramos: MyTasksSummaryTramo[];
};

export type MyTasksSummary = {
  /** The `YYYY-MM-DD` the counts were made on. */
  today: string;
  /** Every open task of mine, whatever the filters (KPIs, Estado chips, board columns, hero). */
  all: {
    open: number;
    overdue: number;
    /** Open and committed today. */
    dueToday: number;
    /** The board columns: Hoy (overdue + today), Esta semana, Después. */
    buckets: Record<MyTaskBucket, number>;
    projects: number;
  };
  /** The Tramo chips: every tramo of my open tasks with how many, by sort order. */
  tramos: { id: string; key: string; name: string; sortOrder: number; open: number }[];
  /** What the filters match: the Mis tareas header and footer. */
  shown: MyTasksCounts & { projects: number };
  /**
   * Analítico groups: the projects with a matching task (open or closed),
   * overdue first, then by name; tramos by sort order, "Sin tramo" last.
   */
  projects: MyTasksSummaryProject[];
  /**
   * Esencial cards: the projects with an open task, overdue first, then by
   * the nearest commitment date (undated last), then by name.
   */
  esencial: { project: { id: string; name: string }; open: number; overdue: number; nearestDue: string | null }[];
};

export const EMPTY_MY_TASKS_COUNTS: MyTasksCounts = { open: 0, overdue: 0, blocked: 0, daysLateSum: 0, maxDaysLate: 0, closed: 0 };

export const EMPTY_MY_TASKS_SUMMARY: MyTasksSummary = {
  today: "",
  all: { open: 0, overdue: 0, dueToday: 0, buckets: { hoy: 0, semana: 0, despues: 0 }, projects: 0 },
  tramos: [],
  shown: { ...EMPTY_MY_TASKS_COUNTS, projects: 0 },
  projects: [],
  esencial: [],
};

/** No filter: what Visual and Esencial count (and Analítico without filters). */
export const MY_TASKS_ALL: MyTasksSummaryInput = { tramo: null, q: null };

/** The summary input of the Analítico filters. */
export function myTasksSummaryInput(f: { tramo: string | null; q: string; retraso: boolean }): MyTasksSummaryInput {
  const q = f.q.trim();
  return { tramo: f.tramo, q: q === "" ? null : q, ...(f.retraso ? { retraso: true as const } : {}) };
}

// ── Lists ────────────────────────────────────────────────────────────────────

/**
 * One Mi espacio task list (`qk.me.tasksList(f)`): my tasks (Responsable or
 * apoyo), open ones unless `cerradas`, subtasks as rows of their own.
 * Optional fields are left out when unset, so equal lists share a key.
 */
export type MeTasksListFilters = {
  proyecto?: string;
  /** A tramo key, or `SIN_TRAMO_KEY` for the tasks without a tramo. */
  tramo?: string;
  q?: string;
  /** Overdue only (`?estado=retraso`). */
  retraso?: true;
  /** A board column (Visual). */
  vence?: MyTaskBucket;
  /** Closed tasks too ("Ocultar completadas" off). */
  cerradas?: true;
  /** "retraso": overdue first, then open, then closed, each by due date. "vence": by due date. */
  orderBy?: "retraso" | "vence";
};

/** Rows of every "Cargar más" / "Ver más" page. */
export const ME_TASKS_PAGE_SIZE = TASK_LIST_PAGE_SIZE;
/** First page of a board column (Visual): the cards the column shows before "Cargar más". */
export const ME_BOARD_FIRST_PAGE = 5;
/** Esencial: project cards shown, and the rows of each card before "Ver más". */
export const ME_ESENCIAL_LIMITS = { projects: 3, perProject: 4 } as const;
/** Analítico tramo groups whose first page the server seeds (as Tareas does). */
export const ME_ANALITICO_SEEDED_GROUPS = 3;

/** The first page's size of a list: a board column or an Esencial card show fewer rows first. */
export function meTasksFirstPageSize(f: MeTasksListFilters): number {
  if (f.vence) return ME_BOARD_FIRST_PAGE;
  if (f.proyecto && !f.tramo) return ME_ESENCIAL_LIMITS.perProject;
  return ME_TASKS_PAGE_SIZE;
}

/** An Analítico tramo group's list: the summary filters narrowed to the project and the tramo. */
export function meTasksGroupFilters(
  input: MyTasksSummaryInput,
  projectId: string,
  tramoKey: string | null,
  withClosed: boolean,
): MeTasksListFilters {
  return {
    proyecto: projectId,
    tramo: tramoKey ?? SIN_TRAMO_KEY,
    ...(input.q ? { q: input.q } : {}),
    ...(input.retraso ? { retraso: true as const } : {}),
    ...(withClosed && !input.retraso ? { cerradas: true as const } : {}),
    orderBy: "retraso",
  };
}

/** A board column's list (Visual). */
export function meTasksBucketFilters(bucket: MyTaskBucket): MeTasksListFilters {
  return { vence: bucket, orderBy: "vence" };
}

/** An Esencial project card's list. */
export function meTasksProjectFilters(projectId: string): MeTasksListFilters {
  return { proyecto: projectId, orderBy: "vence" };
}

/** The commitment window of a board column or of En retraso, on `today` (the repository's `TaskFilters.commitment`). */
export function meTasksCommitmentWindow(
  f: Pick<MeTasksListFilters, "vence" | "retraso">,
  today: string,
): { from?: string; to?: string; orUndated?: boolean } | undefined {
  const sunday = sundayOf(today);
  if (f.vence === "hoy") return { to: today };
  if (f.vence === "semana") return { from: addDays(today, 1), to: sunday };
  if (f.vence === "despues") return { from: addDays(sunday, 1), orUndated: true };
  if (f.retraso) return { to: addDays(today, -1) };
  return undefined;
}

/**
 * Whether a row belongs in a list by the fields the client can check (a
 * task created or reopened here): project, tramo and board column. The
 * search and En retraso are left to the refetch.
 */
export function rowFitsMeList(
  f: MeTasksListFilters,
  row: { projectId: string; workflow: { key: string } | null; commitmentDate: string | null },
  today: string,
): boolean {
  if (f.retraso || f.q) return false;
  if (f.proyecto && row.projectId !== f.proyecto) return false;
  if (f.tramo && (f.tramo === SIN_TRAMO_KEY ? row.workflow !== null : row.workflow?.key !== f.tramo)) return false;
  if (f.vence) {
    const due = row.commitmentDate ? row.commitmentDate.slice(0, 10) : null;
    const sunday = sundayOf(today);
    const bucket: MyTaskBucket = !due ? "despues" : due <= today ? "hoy" : due <= sunday ? "semana" : "despues";
    if (bucket !== f.vence) return false;
  }
  return true;
}

// ── Analítico groups ─────────────────────────────────────────────────────────

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Rows a group lists: the open ones, plus the closed ones while they are shown. */
export function groupRowCount(c: Pick<MyTasksCounts, "open" | "closed">, withClosed: boolean): number {
  return c.open + (withClosed ? c.closed : 0);
}

/**
 * The Analítico project → tramo groups from the summary, with the loaded
 * rows of each tramo group (`rowsOf`, undefined while it loads). Captions
 * and metrics count every matching task, not only the loaded rows: project
 * "{n} tareas" and "{k} vencidas · {max} d"; tramo "{n} · {k} vencidas"
 * (+ " · bloqueada" when one is blocked).
 */
export function myTasksSummaryGroups(
  summary: MyTasksSummary,
  opts: {
    withClosed: boolean;
    rowsOf(groupId: string): TaskRow[] | undefined;
  },
): Group<TaskRow>[] {
  const { withClosed } = opts;
  return summary.projects
    .filter((p) => groupRowCount(p, withClosed) > 0)
    .map((p) => {
      const children: Group<TaskRow>[] = p.tramos
        .filter((t) => groupRowCount(t, withClosed) > 0)
        .map((t) => {
          const id = tramoGroupId(p.project.id, t.tramo.id);
          const rows = opts.rowsOf(id);
          const total = groupRowCount(t, withClosed);
          return {
            id,
            label: t.tramo.id ? t.tramo.name : SIN_TRAMO,
            color: t.tramo.key ? tramoColorVar({ key: t.tramo.key, sortOrder: t.tramo.sortOrder }) : undefined,
            caption: `${total} · ${plural(t.overdue, "vencida", "vencidas")}${t.blocked > 0 ? " · bloqueada" : ""}`,
            metrics: [],
            rows: rows ?? [],
            loading: rows === undefined,
            remaining: rows ? Math.max(0, total - rows.length) : undefined,
          };
        });
      return {
        id: p.project.id,
        label: p.project.name,
        caption: plural(groupRowCount(p, withClosed), "tarea", "tareas"),
        metrics: [
          p.overdue > 0
            ? { key: "vencidas", value: `${plural(p.overdue, "vencida", "vencidas")} · ${p.maxDaysLate} d`, tone: "destructive" as const }
            : { key: "vencidas", value: "0 vencidas", tone: "muted" as const },
        ],
        children,
      };
    });
}

/** Header numbers of Mis tareas: the open ones the filters match. */
export function shownMetrics(shown: MyTasksSummary["shown"]): { overduePct: number; avgDaysLate: number } {
  return {
    overduePct: shown.open === 0 ? 0 : Math.round((shown.overdue / shown.open) * 100),
    avgDaysLate: shown.overdue === 0 ? 0 : Math.round((shown.daysLateSum / shown.overdue) * 10) / 10,
  };
}
