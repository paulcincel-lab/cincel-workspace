import "server-only";

import type { TareasPageKeyInput } from "@/lib/query/keys";
import {
  TAREAS_BOARD_PER_COLUMN,
  TAREAS_LIST_PAGE_SIZE,
  emptyBoardColumns,
  type TareasBoardColumn,
  type TareasBoardData,
  type TareasFacets,
  type TareasPageData,
  type TareasRowsPage,
  type TareasStaffOption,
} from "@/lib/tareas/page-data";
import type { TaskKind, TaskStatusOption, ViewerScope, WorkflowRef } from "@/lib/types/core";

import { loadCatalogTaskStatuses, loadCatalogWorkflows } from "@/lib/loaders/catalog";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import * as taskSheetRepository from "@/lib/repositories/task-sheet-repository";
import type { TaskSheetData } from "@/lib/types/task-sheet";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { positionPhases, positions, staff, staffPositions, workflowPhases } from "@/lib/db/schema";
import { FLOW_ERROR, flowError, flowErrorCode } from "@/lib/project-flow/errors";
import { tramoBoard } from "@/lib/project-flow/readiness";
import type { StartSlotCandidate, TareasStartSlotData } from "@/lib/types/tareas-start-slot";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { scopeTaskDto, viewerScopeOf } from "@/lib/auth/viewer-scope";
import type { TareasListFilters } from "@/lib/query/keys";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type { TaskFilters, TaskListRow, TaskRef } from "@/lib/types/core";
import { esencialResponsable } from "@/lib/tareas/query";
import { EMPTY_TAREAS_SUMMARY, SIN_TRAMO_KEY, tareasGroupFilters, type TareasSummary } from "@/lib/tareas/summary";
import {
  currentTaskStatus,
  inMemoryCounter,
  isoDateRange,
  localDayOf,
  shiftIsoDate,
  statusResolver,
  taskDayState,
} from "@/lib/dashboard/inicio";
import { TASK_TREND_TIME_ZONE, localIsoDate } from "@/lib/dashboard/task-trend";
import { dailySeries, deltaTone, formatSignedDelta, kpiFromDaily, type DailyPoint } from "@/lib/metrics/series";
import * as inicioRepository from "@/lib/repositories/inicio-repository";
import type { TareasTrend, TareasTrendKey } from "@/lib/tareas/page-data";
import { sortListaTasks } from "@/components/tareas/lista-table";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import {
  TAREAS_BY_PROJECT_LIMIT,
  listItemOfRow,
  type TareasByProject,
  type TareasProjectGroup,
} from "@/lib/tareas/page-data";

// ── Start slot (Query Migration 4d, #958) ────────────────────────────────────

/**
 * Active staff `{id,name,suggested}` for the Iniciar tramo sheet, in one
 * query: `suggested` when a live puesto of theirs covers an active fase of the
 * tramo. Same rows and order as `fetchAssignableStaffAction(workflowId)`
 * (suggested first, then by nombre), without the full `Staff` row.
 */
export async function loadStartSlotCandidates(workflowId: string): Promise<StartSlotCandidate[]> {
  const coversTramo = db
    .select({ one: sql`1` })
    .from(staffPositions)
    .innerJoin(positions, eq(positions.id, staffPositions.positionId))
    .innerJoin(positionPhases, eq(positionPhases.positionId, positions.id))
    .innerJoin(workflowPhases, eq(workflowPhases.id, positionPhases.phaseId))
    .where(
      and(
        eq(staffPositions.staffId, staff.id),
        eq(workflowPhases.workflowId, workflowId),
        eq(workflowPhases.active, true),
        isNull(positions.deletedAt),
        eq(positions.active, true),
      ),
    );
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      suggested: sql<boolean>`exists (${coversTramo})`.mapWith(Boolean),
    })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true)))
    .orderBy(sql`${staff.sortOrder} is null`, asc(staff.sortOrder), asc(staff.name));
  return rows
    .sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.name.localeCompare(b.name))
    .map((r) => ({ id: r.id, name: [r.name, r.lastName].filter(Boolean).join(" "), suggested: r.suggested }));
}

/**
 * `tareas.startSlot(tramoId)` loader: `(user, input) => data`.
 * `getTareasStartSlotData` calls it after the session check and parsing; a
 * server prefetch calls it directly. FORBIDDEN without the Tareas capability
 * (`canViewActivities`); null when the tramo is missing or inactive. The
 * board and the candidates load in parallel (≤ 5 statements together).
 * Read-only.
 */
export async function loadTareasStartSlot(
  user: AuthenticatedUser,
  input: { tramoId: string },
): Promise<TareasStartSlotData | null> {
  const caps = resolveActivitiesCapabilities(user);
  if (!caps.canViewActivities) throw flowError(FLOW_ERROR.FORBIDDEN, "tareas");
  const [board, candidates] = await Promise.all([
    tramoBoard(db, input.tramoId, viewerScopeOf(user)).catch((err: unknown) => {
      if (flowErrorCode(err) === FLOW_ERROR.NOT_FOUND) return null;
      throw err;
    }),
    loadStartSlotCandidates(input.tramoId),
  ]);
  if (!board) return null;
  return { board, candidates, canStart: caps.canCreateActivity };
}

// ── TaskSheet (Query Migration 4b, #956) ─────────────────────────────────────

/**
 * `tasks.detail(id)` loader (`getTaskSheetData`): the task and the catalogs
 * its sheet needs, in ≤ 5 statements. FORBIDDEN without the Tareas
 * capability. Null when the viewer can't see the task: missing or deleted, in
 * a deleted project, an admin task for a non-admin, or no `canViewProjects`.
 * Admin fields are stripped here (`scopeTaskDto`): the client name reaches
 * administrators only. `assignable` is `{id,name,suggested}`, never `Staff`;
 * an admin task gets no espacios.
 */
export async function loadTaskSheet(user: AuthenticatedUser, input: { id: string }): Promise<TaskSheetData | null> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) throw new Error("FORBIDDEN: tareas");
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  const viewer = viewerScopeOf(user);
  const [detail, statuses, workflows] = await Promise.all([
    taskSheetRepository.getTaskSheetDetail(input.id),
    loadCatalogTaskStatuses(user),
    loadCatalogWorkflows(),
  ]);
  if (!detail) return null;
  if (detail.task.kind === "admin" && !viewer.isAdmin) return null;
  const task = scopeTaskDto(detail.task, viewer);
  const [assignable, spaces] = await Promise.all([
    taskSheetRepository.listAssignableStaffOptions(task.workflowId),
    task.kind === "admin" ? Promise.resolve([]) : taskSheetRepository.listProjectSpacesWithCounts(task.projectId),
  ]);
  return {
    task,
    statuses,
    workflows,
    assignable: assignable.map(({ id, name, suggested }) => ({ id, name, suggested })),
    spaces,
    phases: detail.phases,
  };
}

/**
 * `tasks.options(projectId, q)` loader (`searchProjectTasksAction`): the
 * dependency picker's rows, at most `limit` (20 by default). FORBIDDEN
 * without the Tareas capability or when the viewer can't see the project
 * (no `canViewProjects`, or the project is missing or deleted). Never admin
 * tasks.
 */
export async function searchProjectTasks(
  user: AuthenticatedUser,
  input: { projectId: string; q: string; limit?: number; excludeId?: string },
): Promise<TaskRef[]> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) throw new Error("FORBIDDEN: tareas");
  if (!resolveProjectsCapabilities(user).canViewProjects) throw new Error("FORBIDDEN: project");
  if (!(await projectsRepository.projectExists(input.projectId))) throw new Error("FORBIDDEN: project");
  return taskSheetRepository.searchProjectTasks(input.projectId, input.q, input.limit ?? 20, input.excludeId);
}

// ── Lista y Tablero (Query Migration 4a, #955) ───────────────────────────────

function requireTareasView(user: AuthenticatedUser): void {
  if (!resolveActivitiesCapabilities(user).canViewActivities) throw new Error("FORBIDDEN: tareas");
}

const ALL_KINDS_FOR_ADMIN: TaskKind[] = ["workflow", "usuario", "admin"];

/** Live tramos with a key, by `sortOrder` (`listTramos` without the action round trip). */
async function loadTareasTramos(): Promise<WorkflowRef[]> {
  return (await workflowsRepository.listTramosNav()).filter((t) => t.key.trim() !== "");
}

/**
 * The filters every view shares minus tramo and proyecto (they feed the chip
 * counts and the Proyecto options). "Responsable: Yo" is Mis tareas: the
 * viewer's own tasks, an administrator's own admin tasks included
 * (`fetchMyTasksAction`); everyone else never gets admin tasks (the default kinds).
 */
function tareasBaseFilters(user: AuthenticatedUser, viewer: ViewerScope, filters: TareasListFilters): TaskFilters {
  const out: TaskFilters = {};
  if (filters.q) out.search = filters.q;
  if (filters.estado) out.status = filters.estado;
  // "Incluir apoyo" (#1038, on by default): the person as Responsable or apoyo; off, as Responsable only.
  const person = filters.responsable === "yo" ? user.member.id : filters.responsable !== "todos" ? filters.responsable : null;
  if (person) {
    if (filters.apoyo === false) out.managerId = person;
    else out.involvesStaffId = person;
  }
  if (filters.responsable === "yo" && viewer.isAdmin) out.kind = ALL_KINDS_FOR_ADMIN;
  if (filters.mostrar && filters.mostrar !== "todas") out.mostrar = filters.mostrar;
  return out;
}

/** Every filter applied; null when the tramo key matches no live tramo (the view loads nothing). */
function tareasViewFilters(
  user: AuthenticatedUser,
  viewer: ViewerScope,
  filters: TareasListFilters,
  tramos: WorkflowRef[],
): TaskFilters | null {
  const out = tareasBaseFilters(user, viewer, filters);
  if (filters.tramo === SIN_TRAMO_KEY) {
    out.withoutWorkflow = true;
  } else if (filters.tramo) {
    const tramo = tramos.find((t) => t.key === filters.tramo);
    if (!tramo) return null;
    out.workflowId = tramo.id;
  }
  if (filters.proyecto) out.projectId = filters.proyecto;
  return out;
}

/** Active staff `{id,name}` (nombre + apellido) for the Responsable filter, in one query. */
async function loadTareasStaffOptions(): Promise<TareasStaffOption[]> {
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true)))
    .orderBy(asc(staff.name));
  return rows.map((r) => ({ id: r.id, name: [r.name, r.lastName].filter(Boolean).join(" ").trim() }));
}

/** The status catalog for the board's custom columns; a failed read only drops the empty custom columns. */
async function loadBoardStatuses(user: AuthenticatedUser): Promise<TaskStatusOption[]> {
  try {
    return await loadCatalogTaskStatuses(user);
  } catch (err) {
    console.error("[tareas] statuses", err);
    return [];
  }
}

function boardWithCatalog(
  columns: Record<string, TareasBoardColumn>,
  statuses: TaskStatusOption[],
): TareasBoardData {
  return { columns: { ...emptyBoardColumns(statuses), ...columns }, statuses };
}

/** The facets of the filters for the viewer (`qk.tareas.facets(f)`). */
async function tareasFacets(
  user: AuthenticatedUser,
  viewer: ViewerScope,
  filters: TareasListFilters,
): Promise<TareasFacets> {
  return tasksRepository.taskFacets(tareasBaseFilters(user, viewer, filters), viewer, {
    workflowKey: filters.tramo,
    projectId: filters.proyecto,
  });
}

/** `qk.tareas.facets(f)` loader. FORBIDDEN without the Tareas capability. */
export async function loadTareasFacets(user: AuthenticatedUser, input: { filters: TareasListFilters }): Promise<TareasFacets> {
  requireTareasView(user);
  return tareasFacets(user, viewerScopeOf(user), input.filters);
}

async function tareasBoard(
  user: AuthenticatedUser,
  viewer: ViewerScope,
  filters: TaskFilters | null,
): Promise<TareasBoardData> {
  const [statuses, columns] = await Promise.all([
    loadBoardStatuses(user),
    filters
      ? tasksRepository.listBoardColumns(filters, viewer, TAREAS_BOARD_PER_COLUMN)
      : Promise.resolve<Record<string, TareasBoardColumn>>({}),
  ]);
  return boardWithCatalog(columns, statuses);
}

/** `qk.tareas.board(f)` loader: every column of the catalog, the first rows of each. FORBIDDEN without Tareas. */
export async function loadTareasBoard(user: AuthenticatedUser, input: { filters: TareasListFilters }): Promise<TareasBoardData> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  return tareasBoard(user, viewer, filters);
}

const EMPTY_PAGE: TareasRowsPage = { rows: [], nextCursor: null, total: 0 };

/** `qk.tareas.list(f)` page loader (`useInfiniteQuery`, the cursor is the page param). FORBIDDEN without Tareas. */
export async function loadTareasListPage(
  user: AuthenticatedUser,
  input: { filters: TareasListFilters; cursor: string | null; limit?: number; orderBy?: "retraso" },
): Promise<TareasRowsPage> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  if (!filters) return EMPTY_PAGE;
  return tasksRepository.listTasksPage(filters, viewer, {
    cursor: input.cursor,
    limit: input.limit ?? TAREAS_LIST_PAGE_SIZE,
    ...(input.orderBy ? { orderBy: input.orderBy } : {}),
  });
}

/** `qk.tareas.board(f, columnId)` loader: the rows of one column after the cursor. FORBIDDEN without Tareas. */
export async function loadTareasBoardColumn(
  user: AuthenticatedUser,
  input: { filters: TareasListFilters; columnId: string; cursor: string | null },
): Promise<TareasBoardColumn> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  if (!filters) return { rows: [], total: 0, nextCursor: null };
  return tasksRepository.listTasksPage(
    { ...filters, archived: false },
    viewer,
    { cursor: input.cursor, limit: TAREAS_BOARD_PER_COLUMN, columnKey: input.columnId },
  );
}

// ── Analítico (Estilos, #988) ────────────────────────────────────────────────

/** Expanded tramo groups whose first page the Analítico bundle seeds. */
export const TAREAS_ANALITICO_SEEDED_GROUPS = 3;

/**
 * `qk.tareas.summary(f)` loader (`getTareasSummary`): the Analítico counts
 * over every task the filters match, per project and tramo, per project and
 * in total, plus the same filters without `mostrar`. One grouping-sets
 * statement (and one more with `mostrar`). Overdue is
 * `coalesce(commitment, delivery)` before today in America/Mexico_City.
 * `ViewerScope` applies as for the rows (admin tasks only in an
 * administrator's "Responsable: Yo"). FORBIDDEN without Tareas.
 */
export async function loadTareasSummary(
  user: AuthenticatedUser,
  input: { filters: TareasListFilters },
  now: Date = new Date(),
): Promise<TareasSummary> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  if (!filters) return EMPTY_TAREAS_SUMMARY;
  return tasksRepository.taskSummary(filters, viewer, todayInAppTimeZone(now));
}

/**
 * The Analítico part of the page bundle: the summary, then the first page
 * ("retraso" order) of the first `TAREAS_ANALITICO_SEEDED_GROUPS` tramo
 * groups in display order (every group starts expanded).
 */
async function analiticoBundle(
  user: AuthenticatedUser,
  viewer: ViewerScope,
  filters: TareasListFilters,
  viewFilters: TaskFilters | null,
  tramos: WorkflowRef[],
): Promise<{ summary: TareasSummary; groups: { filters: TareasListFilters; page: TareasRowsPage }[] }> {
  if (!viewFilters) return { summary: EMPTY_TAREAS_SUMMARY, groups: [] };
  const today = todayInAppTimeZone();
  const summary = await tasksRepository.taskSummary(viewFilters, viewer, today);
  const first = summary.projects
    .flatMap((p) => p.tramos.map((t) => ({ projectId: p.project.id, tramo: t.tramo })))
    .slice(0, TAREAS_ANALITICO_SEEDED_GROUPS);
  const groups = await Promise.all(
    first.map(async ({ projectId, tramo }) => {
      const groupFilters = tareasGroupFilters(filters, projectId, tramo.key);
      const repoFilters = tareasViewFilters(user, viewer, groupFilters, tramos);
      const page = repoFilters
        ? await tasksRepository.listTasksPage({ ...repoFilters, today }, viewer, {
            cursor: null,
            limit: TAREAS_LIST_PAGE_SIZE,
            orderBy: "retraso",
          })
        : EMPTY_PAGE;
      return { filters: groupFilters, page };
    }),
  );
  return { summary, groups };
}

/**
 * `qk.tareas.page(q)` loader: `(user, input) => data`. `getTareasPageData`
 * calls it after the session check and parsing; the `/tareas` page prefetches
 * through it directly. FORBIDDEN without the Tareas capability.
 *
 * One call per layout (the resolved style), in ≤ 6 statements (7 for
 * Analítico): the tramos, then at once the staff options, the facets and
 * every board column plus the status catalog (Visual), the cards per project
 * (Esencial) or the summary and the first page of the first 3 tramo groups
 * (Analítico). Rows are slim (`TaskListRow`), scoped by the
 * repository: admin tasks only in an administrator's "Responsable: Yo",
 * client names only for administrators. Staff are `{id,name}`.
 */
export async function loadTareasPage(
  user: AuthenticatedUser,
  input: Pick<TareasPageKeyInput, "estilo"> & TareasListFilters,
): Promise<TareasPageData> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters: TareasListFilters = {
    tramo: input.tramo,
    proyecto: input.proyecto,
    // Esencial reads a missing responsable as "yo" (Solo mías on by default).
    responsable: input.estilo === "esencial" ? esencialResponsable(input.responsable) : input.responsable,
    estado: input.estado,
    q: input.q,
    ...(input.mostrar && input.mostrar !== "todas" ? { mostrar: input.mostrar } : {}),
    ...(input.apoyo === false ? { apoyo: false as const } : {}),
  };
  const tramos = await loadTareasTramos();
  const viewFilters = tareasViewFilters(user, viewer, filters, tramos);
  const [staffOptions, facets, analitico, board, byProject] = await Promise.all([
    loadTareasStaffOptions(),
    tareasFacets(user, viewer, filters),
    input.estilo === "analitico" ? analiticoBundle(user, viewer, filters, viewFilters, tramos) : Promise.resolve(undefined),
    input.estilo === "visual" ? tareasBoard(user, viewer, viewFilters) : Promise.resolve(undefined),
    input.estilo === "esencial" ? loadTareasByProject(user, { filters }) : Promise.resolve(undefined),
  ]);
  const data: TareasPageData = { facets, tramos, staff: staffOptions };
  if (analitico) {
    data.summary = analitico.summary;
    data.groups = analitico.groups;
  }
  if (board) data.board = board;
  if (byProject) data.byProject = byProject;
  return data;
}

// ── Visual summary (Estilos, #986) ───────────────────────────────────────────

/** Days of status history the trend reads: this week and the same span last week. */
const TREND_DAYS = 14;

/** Monday of the week that holds the ISO date `day`. */
function mondayOf(day: string): string {
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftIsoDate(day, -weekday);
}

/** "1 persona trabajando", "5 personas trabajando". */
export function activeAssigneesCaption(n: number): string {
  return `${n.toLocaleString("es-MX")} ${n === 1 ? "persona trabajando" : "personas trabajando"}`;
}

type TrendKpi = TareasTrend["kpis"][number];

function trendKpi(
  key: TareasTrendKey,
  label: string,
  daily: DailyPoint[],
  delta: { change: number; goodWhen: "up" | "down"; suffix: string } | null,
  value?: number,
): TrendKpi {
  const base = kpiFromDaily(key, label, daily, { goodWhen: delta?.goodWhen ?? "up" });
  const kpi: TrendKpi = { key, label, value: value ?? base.value, series7: base.series7 };
  if (delta) {
    const tone = deltaTone(delta.change, delta.goodWhen);
    kpi.delta = {
      value: delta.change,
      good: tone !== "bad",
      caption: delta.suffix,
      label: `${formatSignedDelta(delta.change)} ${delta.suffix}`,
      tone,
    };
  }
  return kpi;
}

/** The trend of a filter that matches nothing (an unknown tramo key): no tiles, an empty week. */
function emptyTrend(monday: string): TareasTrend {
  const sunday = shiftIsoDate(monday, 6);
  const days = isoDateRange(monday, sunday).map((date) => ({ date, due: 0, tramoKey: null }));
  return { kpis: [], activeAssignees: 0, week: { from: monday, to: sunday, total: 0, days } };
}

/**
 * `qk.tareas.trend(f)` loader (`getTareasTrend`): the Tareas Visual summary
 * over the same tasks as the board (every URL filter, `ViewerScope`, admin
 * tasks only where the board shows them). FORBIDDEN without Tareas.
 *
 * - Abiertas, Vencidas, En proceso: the count at the end of each of the last
 *   7 days, from the rows as they are now plus their status history
 *   (`taskDayState`); Abiertas and Vencidas compare today with the end of the
 *   day before Monday.
 * - Completadas: tasks moved to completado per day; the value is Monday to
 *   today, compared with the same span last week.
 * - `activeAssignees`: distinct responsables of the tasks en proceso.
 * - `week`: open tasks due per day, Monday to Sunday, with the dominant tramo.
 */
export async function loadTareasTrend(
  user: AuthenticatedUser,
  input: { filters: TareasListFilters },
  now: Date = new Date(),
): Promise<TareasTrend> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const tz = TASK_TREND_TIME_ZONE;
  const today = localIsoDate(now, tz);
  const monday = mondayOf(today);
  const sunday = shiftIsoDate(monday, 6);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  if (!filters) return emptyTrend(monday);

  const firstDay = shiftIsoDate(today, -(TREND_DAYS - 1));
  // Status changes since a day before the first day (a margin for the UTC offset).
  const historySince = new Date(Date.parse(`${shiftIsoDate(firstDay, -1)}T00:00:00Z`));
  const [rows, events, dueDays] = await Promise.all([
    tasksRepository.listTaskRows({ ...filters, archived: false }, viewer),
    inicioRepository.listStatusEvents("task", historySince),
    tasksRepository.taskDueByDay({ ...filters, archived: false }, viewer, { from: monday, to: sunday }),
  ]);
  const ids = new Set(rows.map((r) => r.id));
  const scopedEvents = events.filter((e) => ids.has(e.entityId));
  const statusAt = statusResolver(scopedEvents, tz);
  const state = taskDayState(statusAt, tz);
  const inProgressOn = (t: TaskListRow, day: string) =>
    localDayOf(t.createdAt, tz) <= day && statusAt(t.id, currentTaskStatus(t), day) === "en_proceso";

  const completedOn = new Map<string, Set<string>>();
  for (const e of scopedEvents) {
    if (e.after !== "completado") continue;
    const day = localDayOf(e.at, tz);
    const set = completedOn.get(day) ?? new Set<string>();
    set.add(e.entityId);
    completedOn.set(day, set);
  }
  const completedBetween = (from: string, to: string) => {
    const set = new Set<string>();
    for (const day of isoDateRange(from, to)) for (const id of completedOn.get(day) ?? []) set.add(id);
    return set.size;
  };

  const daily = (countOn: (day: string) => number) => dailySeries(inMemoryCounter(countOn), TREND_DAYS, now, tz);
  const [openDaily, overdueDaily, inProgressDaily, completedDaily] = await Promise.all([
    daily((day) => rows.filter((t) => state.open(t, day)).length),
    daily((day) => rows.filter((t) => state.overdue(t, day)).length),
    daily((day) => rows.filter((t) => inProgressOn(t, day)).length),
    daily((day) => completedOn.get(day)?.size ?? 0),
  ]);
  const valueOn = (series: DailyPoint[], day: string) => series.find((p) => p.date === day)?.value ?? 0;
  const beforeMonday = shiftIsoDate(monday, -1);
  const lastOf = (series: DailyPoint[]) => series.at(-1)?.value ?? 0;

  const thisWeekDone = completedBetween(monday, today);
  const lastWeekDone = completedBetween(shiftIsoDate(monday, -7), shiftIsoDate(today, -7));

  const inProgress = rows.filter((t) => currentTaskStatus(t) === "en_proceso");
  const activeAssignees = new Set(inProgress.map((t) => t.manager?.id).filter((id): id is string => !!id)).size;

  const kpis: TrendKpi[] = [
    trendKpi("abiertas", "Abiertas", openDaily, {
      change: lastOf(openDaily) - valueOn(openDaily, beforeMonday),
      goodWhen: "down",
      suffix: "esta semana",
    }),
    trendKpi("vencidas", "Vencidas", overdueDaily, {
      change: lastOf(overdueDaily) - valueOn(overdueDaily, beforeMonday),
      goodWhen: "down",
      suffix: "desde el lunes",
    }),
    { ...trendKpi("en_proceso", "En proceso", inProgressDaily, null), caption: activeAssigneesCaption(activeAssignees) },
    trendKpi(
      "completadas",
      "Completadas",
      completedDaily,
      { change: thisWeekDone - lastWeekDone, goodWhen: "up", suffix: "vs. semana pasada" },
      thisWeekDone,
    ),
  ];

  const byDay = new Map(dueDays.map((d) => [d.date, d]));
  const days = isoDateRange(monday, sunday).map((date) => ({
    date,
    due: byDay.get(date)?.due ?? 0,
    tramoKey: byDay.get(date)?.tramoKey ?? null,
  }));
  return {
    kpis,
    activeAssignees,
    week: { from: monday, to: sunday, total: days.reduce((sum, d) => sum + d.due, 0), days },
  };
}

// ── Esencial: cards per project (Estilos, #987) ──────────────────────────────

/** The due date of a row: commitment, else delivery. */
function rowDue(row: TaskListRow): string | null {
  const due = row.commitmentDate ?? row.deliveryDate ?? null;
  return due ? due.slice(0, 10) : null;
}

/** Rows in `sortListaTasks` order (the rows themselves, never the list items it sorts). */
function sortRows(rows: TaskListRow[], today: string): TaskListRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return sortListaTasks(rows.map(listItemOfRow), today).map((item) => byId.get(item.id)!);
}

/** Most overdue first, then the nearest due date (none last), then the name (es). */
function compareGroups(a: TareasProjectGroup, b: TareasProjectGroup): number {
  if (a.overdue !== b.overdue) return b.overdue - a.overdue;
  const dueA = a.rows.map(rowDue).filter((d): d is string => d !== null).sort()[0] ?? null;
  const dueB = b.rows.map(rowDue).filter((d): d is string => d !== null).sort()[0] ?? null;
  if (dueA !== dueB) {
    if (!dueA) return 1;
    if (!dueB) return -1;
    return dueA < dueB ? -1 : 1;
  }
  return a.project.name.localeCompare(b.project.name, "es");
}

/**
 * `qk.tareas.byProject(f)` loader (`getTareasByProject`): the Esencial cards,
 * one per project with a matching task. FORBIDDEN without Tareas. Two
 * statements at once, both over the same filters and `ViewerScope` (admin
 * tasks only in an administrator's "Responsable: Yo"):
 *
 * - the counts per project (`taskProjectCounts`, `mostrar` left out): open,
 *   overdue (before today in America/Mexico_City) and closed;
 * - the open rows (`mostrar` abiertas, or en_retraso when asked), at most
 *   `TAREAS_BY_PROJECT_LIMIT`; past it `truncated` is true.
 *
 * `open` is what the card shows: the overdue count with `mostrar=en_retraso`.
 * `completed` only counts with `mostrar=todas`: the other two show open work
 * only, so the cards then have no "N completadas". The filters come resolved:
 * a null responsable here is everyone (Esencial's "yo" default is applied by
 * the caller, `esencialResponsable`).
 */
export async function loadTareasByProject(
  user: AuthenticatedUser,
  input: { filters: TareasListFilters },
  now: Date = new Date(),
): Promise<TareasByProject> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const today = todayInAppTimeZone(now);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  if (!filters) return { groups: [], truncated: false };
  const mostrar = input.filters.mostrar ?? "todas";
  const openFilters: TaskFilters = { ...filters, mostrar: mostrar === "en_retraso" ? "en_retraso" : "abiertas", today };

  const [counts, page] = await Promise.all([
    tasksRepository.taskProjectCounts({ ...filters, mostrar: undefined }, viewer, today),
    tasksRepository.listTasksPage(openFilters, viewer, { cursor: null, limit: TAREAS_BY_PROJECT_LIMIT }),
  ]);

  const rowsByProject = new Map<string, TaskListRow[]>();
  for (const row of page.rows) {
    const list = rowsByProject.get(row.projectId) ?? [];
    list.push(row);
    rowsByProject.set(row.projectId, list);
  }

  const groups: TareasProjectGroup[] = [];
  for (const c of counts) {
    const open = mostrar === "en_retraso" ? c.overdue : c.open;
    const completed = mostrar === "todas" ? c.completed : 0;
    if (open === 0 && completed === 0) continue;
    groups.push({
      project: { id: c.projectId, name: c.projectName },
      open,
      overdue: c.overdue,
      completed,
      rows: sortRows(rowsByProject.get(c.projectId) ?? [], today),
    });
  }
  groups.sort(compareGroups);
  return { groups, truncated: page.nextCursor !== null };
}
