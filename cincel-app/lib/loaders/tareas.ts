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
import type { TaskFilters, TaskListRow, TaskRef, TaskStatus } from "@/lib/types/core";
import type { QueryClient } from "@tanstack/react-query";
import { calendarFetchRange, fromDayKey, startOfDay } from "@/lib/calendar/calendar-agenda";
import { STALE, qk } from "@/lib/query/keys";
import { prefetch } from "@/lib/query/server";
import type { TareasQuery } from "@/lib/tareas/query";

// ── Calendario (Query Migration 4c, #957) ────────────────────────────────────

/**
 * `TareasListFilters` → repository `TaskFilters`: the tramo key becomes its
 * workflow id, "Responsable: Yo" the viewer. Null when the tramo key matches
 * no live tramo, so the view loads nothing (as the page did).
 */
async function calendarTaskFilters(
  user: AuthenticatedUser,
  filters: TareasListFilters,
): Promise<TaskFilters | null> {
  const out: TaskFilters = {};
  if (filters.tramo) {
    const tramo = (await workflowsRepository.listTramosNav()).find((t) => t.key === filters.tramo);
    if (!tramo) return null;
    out.workflowId = tramo.id;
  }
  if (filters.proyecto) out.projectId = filters.proyecto;
  if (filters.responsable) out.involvesStaffId = filters.responsable === "yo" ? user.member.id : filters.responsable;
  if (filters.estado) out.status = filters.estado as TaskStatus;
  if (filters.q) out.search = filters.q;
  return out;
}

/**
 * `tareas.calendar(f, from, to)` loader: `(user, input) => data`.
 * `getTareasCalendarData` calls it after the session check and parsing; a
 * server prefetch calls it directly. FORBIDDEN without the Tareas capability.
 * Slim rows (`TaskListRow`, no `notes`) with a commitment, review or delivery
 * date in the inclusive range; admin tasks never (the default task kinds),
 * client names only for administrators (the repository's viewer scoping).
 */
export async function loadTareasCalendar(
  user: AuthenticatedUser,
  input: { filters: TareasListFilters; from: string; to: string },
): Promise<TaskListRow[]> {
  if (!resolveActivitiesCapabilities(user).canViewActivities) throw new Error("FORBIDDEN: tareas");
  const filters = await calendarTaskFilters(user, input.filters);
  if (!filters) return [];
  return tasksRepository.listTaskRows({ ...filters, dateFrom: input.from, dateTo: input.to }, viewerScopeOf(user));
}

/**
 * Server prefetch of the range `/tareas?vista=calendario` shows first
 * (`cal` + `?fecha`, or today), under the key `tareasCalendarOptions` uses.
 * The page already checked the viewer; the loader re-checks the capability.
 */
export async function prefetchTareasCalendar(
  qc: QueryClient,
  user: AuthenticatedUser,
  query: TareasQuery,
  today: Date = new Date(),
): Promise<void> {
  const filters: TareasListFilters = {
    tramo: query.tramo,
    proyecto: query.proyecto,
    responsable: query.responsable,
    estado: (query.estado as TaskStatus | null) ?? null,
    q: query.q,
  };
  const cursor = query.fecha ? fromDayKey(query.fecha) : startOfDay(today);
  const { from, to } = calendarFetchRange(query.cal, cursor);
  await prefetch(qc, { queryKey: qk.tareas.calendar(filters, from, to), staleTime: STALE.screen }, () =>
    loadTareasCalendar(user, { filters, from, to }),
  );
}

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
  if (filters.responsable === "yo") {
    out.involvesStaffId = user.member.id;
    if (viewer.isAdmin) out.kind = ALL_KINDS_FOR_ADMIN;
  } else if (filters.responsable) {
    out.involvesStaffId = filters.responsable;
  }
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
  if (filters.tramo) {
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
  input: { filters: TareasListFilters; cursor: string | null; limit?: number },
): Promise<TareasRowsPage> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters = tareasViewFilters(user, viewer, input.filters, await loadTareasTramos());
  if (!filters) return EMPTY_PAGE;
  return tasksRepository.listTasksPage(filters, viewer, {
    cursor: input.cursor,
    limit: input.limit ?? TAREAS_LIST_PAGE_SIZE,
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

/**
 * `qk.tareas.page(q)` loader: `(user, input) => data`. `getTareasPageData`
 * calls it after the session check and parsing; the `/tareas` page prefetches
 * through it directly. FORBIDDEN without the Tareas capability.
 *
 * One call per view, in ≤ 6 statements: the tramos, then at once the staff
 * options, the facets and the view's first page (Lista) or every board
 * column plus the status catalog (Tablero). Calendario loads its own range
 * (`tareas.calendar`). Rows are slim (`TaskListRow`), scoped by the
 * repository: admin tasks only in an administrator's "Responsable: Yo",
 * client names only for administrators. Staff are `{id,name}`.
 */
export async function loadTareasPage(
  user: AuthenticatedUser,
  input: Pick<TareasPageKeyInput, "vista"> & TareasListFilters,
): Promise<TareasPageData> {
  requireTareasView(user);
  const viewer = viewerScopeOf(user);
  const filters: TareasListFilters = {
    tramo: input.tramo,
    proyecto: input.proyecto,
    responsable: input.responsable,
    estado: input.estado,
    q: input.q,
  };
  const tramos = await loadTareasTramos();
  const viewFilters = tareasViewFilters(user, viewer, filters, tramos);
  const [staffOptions, facets, list, board] = await Promise.all([
    loadTareasStaffOptions(),
    tareasFacets(user, viewer, filters),
    input.vista === "lista"
      ? viewFilters
        ? tasksRepository.listTasksPage(viewFilters, viewer, { cursor: null, limit: TAREAS_LIST_PAGE_SIZE })
        : Promise.resolve(EMPTY_PAGE)
      : Promise.resolve(undefined),
    input.vista === "tablero" ? tareasBoard(user, viewer, viewFilters) : Promise.resolve(undefined),
  ]);
  const data: TareasPageData = { facets, tramos, staff: staffOptions };
  if (list) data.list = list;
  if (board) data.board = board;
  return data;
}
