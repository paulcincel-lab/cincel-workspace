"use server";

import {
  loadTareasBoard,
  loadTareasBoardColumn,
  loadTareasByProject,
  loadTareasFacets,
  loadTareasListFirstPages,
  loadTareasListPage,
  loadTareasPage,
  loadTareasSummary,
  loadTareasTrend,
  loadTaskChildren,
  loadTaskChildrenBatch,
} from "@/lib/loaders/tareas";
import type { TareasSummary } from "@/lib/tareas/summary";
import type {
  TareasBoardColumn,
  TareasByProject,
  TareasBoardData,
  TareasFacets,
  TareasPageData,
  TareasRowsPage,
  TareasTrend,
} from "@/lib/tareas/page-data";
import {
  TareasBoardColumnInput,
  TareasFiltersInput,
  TareasListFirstPagesInput,
  TareasListPageInput,
  TareasPageInput,
} from "@/lib/tareas/page-input";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import { loadTareasStartSlot, loadTaskSheet, searchProjectTasks } from "@/lib/loaders/tareas";
import type { TareasStartSlotData } from "@/lib/types/tareas-start-slot";
import type { TaskSheetData } from "@/lib/types/task-sheet";
import type { TaskListRow, TaskRef } from "@/lib/types/core";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

// ── Start slot (Query Migration 4d, #958) ────────────────────────────────────

const TareasStartSlotInput = z.object({ etapaId: UuidSchema });

/**
 * `qk.tareas.startSlot(etapaId)` (Query Migration 4d, #958): the Lista start
 * slot of one etapa (board, candidates `{id,name,suggested}`, `canStart`).
 * Parses the input, requires a staff session and hands the viewer to the
 * loader, which requires the Tareas capability (FORBIDDEN otherwise). Null
 * when the etapa is missing or inactive. Read-only.
 */
export async function getTareasStartSlotData(
  input: z.input<typeof TareasStartSlotInput>,
): Promise<TareasStartSlotData | null> {
  const parsed = parseInput(TareasStartSlotInput, input);
  return loadTareasStartSlot(await requireCapabilityUser(), parsed);
}

// ── TaskSheet (Query Migration 4b, #956) ─────────────────────────────────────

const TaskSheetInput = z.object({ id: UuidSchema });

/**
 * `qk.tasks.detail(id)` (Query Migration 4b, #956): the task sheet in one
 * call, with the catalogs it seeds (`catalog.taskStatuses`,
 * `catalog.workflows`, `catalog.assignableStaff(workflowId)`,
 * `catalog.projectSpaces(pid)`). Parses the input, requires a staff session
 * and hands the viewer to the loader: FORBIDDEN without the Tareas
 * capability, null when the viewer can't see the task. Read-only.
 */
export async function getTaskSheetData(input: z.input<typeof TaskSheetInput>): Promise<TaskSheetData | null> {
  const parsed = parseInput(TaskSheetInput, input);
  return loadTaskSheet(await requireCapabilityUser(), parsed);
}

/** Most rows one dependency-picker search returns. */
const PROJECT_TASKS_MAX = 50;

const SearchProjectTasksInput = z.object({
  projectId: UuidSchema,
  q: z.string().max(200),
  limit: z.number().int().min(1).max(PROJECT_TASKS_MAX).optional(),
  excludeId: UuidSchema.optional(),
});

/**
 * `qk.tasks.options(projectId, q)` (Query Migration 4b, #956): the
 * dependency picker's search, 20 rows by default (50 at most). FORBIDDEN
 * when the viewer can't see the project. Never admin tasks. Read-only.
 */
export async function searchProjectTasksAction(input: z.input<typeof SearchProjectTasksInput>): Promise<TaskRef[]> {
  const parsed = parseInput(SearchProjectTasksInput, input);
  return searchProjectTasks(await requireCapabilityUser(), parsed);
}

// ── Lista y Tablero (Query Migration 4a, #955) ───────────────────────────────

export type { TareasPageData } from "@/lib/tareas/page-data";
export type { TareasListFilters } from "@/lib/query/keys";

/**
 * `qk.tareas.page(q)` (Query Migration 4a, #955): one `/tareas` view in one
 * call (facets, etapas, `{id,name}` staff, and the Lista first page or every
 * Tablero column). Parses the input, requires a staff session and hands the
 * viewer to the loader, which requires the Tareas capability (FORBIDDEN
 * otherwise). Read-only.
 */
export async function getTareasPageData(input: z.input<typeof TareasPageInput>): Promise<TareasPageData> {
  const parsed = parseInput(TareasPageInput, input);
  return loadTareasPage(await requireCapabilityUser(), parsed);
}

/** `qk.tareas.list(f)` pages (`useInfiniteQuery`): the rows after `cursor`. FORBIDDEN without Tareas. */
export async function getTareasListPage(input: z.input<typeof TareasListPageInput>): Promise<TareasRowsPage> {
  const parsed = parseInput(TareasListPageInput, input);
  return loadTareasListPage(await requireCapabilityUser(), parsed);
}

/**
 * The first page of several `qk.tareas.list(f)` lists in one request
 * (#1051, "Expandir todo" in Proyectos · Analítico). FORBIDDEN without Tareas.
 */
export async function getTareasListFirstPages(
  input: z.input<typeof TareasListFirstPagesInput>,
): Promise<TareasRowsPage[]> {
  const parsed = parseInput(TareasListFirstPagesInput, input);
  return loadTareasListFirstPages(await requireCapabilityUser(), parsed);
}

/** `qk.tasks.children(parentId)`: a parent's subtasks as table rows (#1047/#1048). FORBIDDEN without Tareas. */
export async function getTaskChildren(parentId: string): Promise<TaskListRow[]> {
  const id = parseInput(UuidSchema, parentId);
  return loadTaskChildren(await requireCapabilityUser(), id);
}

/** Most parents one `getTaskChildrenBatch` call reads ("Expandir subtareas", #1048). */
const TASK_CHILDREN_BATCH_MAX = 100;

/** Several parents' subtasks in one read, by parent id ("Expandir subtareas", #1048). FORBIDDEN without Tareas. */
export async function getTaskChildrenBatch(parentIds: string[]): Promise<Record<string, TaskListRow[]>> {
  const ids = parseInput(z.array(UuidSchema).max(TASK_CHILDREN_BATCH_MAX), parentIds);
  return loadTaskChildrenBatch(await requireCapabilityUser(), [...new Set(ids)]);
}

/** `qk.tareas.board(f, columnId)` pages: one board column after `cursor`. FORBIDDEN without Tareas. */
export async function getTareasBoardColumn(input: z.input<typeof TareasBoardColumnInput>): Promise<TareasBoardColumn> {
  const parsed = parseInput(TareasBoardColumnInput, input);
  return loadTareasBoardColumn(await requireCapabilityUser(), parsed);
}

/** `qk.tareas.board(f)` refetch (after an invalidation): every column's first rows. FORBIDDEN without Tareas. */
export async function getTareasBoard(input: z.input<typeof TareasFiltersInput>): Promise<TareasBoardData> {
  const parsed = parseInput(TareasFiltersInput, input);
  return loadTareasBoard(await requireCapabilityUser(), parsed);
}

/** `qk.tareas.facets(f)` refetch (after an invalidation): the chip counts and Proyecto options. FORBIDDEN without Tareas. */
export async function getTareasFacets(input: z.input<typeof TareasFiltersInput>): Promise<TareasFacets> {
  const parsed = parseInput(TareasFiltersInput, input);
  return loadTareasFacets(await requireCapabilityUser(), parsed);
}

// ── Visual summary (Estilos, #986) ───────────────────────────────────────────

/**
 * `qk.tareas.trend(f)`: the Tareas Visual KPI tiles (7-day series, deltas),
 * the people with a task en proceso and the tasks due per day of the week.
 * FORBIDDEN without Tareas. Read-only.
 */
export async function getTareasTrend(input: z.input<typeof TareasFiltersInput>): Promise<TareasTrend> {
  const parsed = parseInput(TareasFiltersInput, input);
  return loadTareasTrend(await requireCapabilityUser(), parsed);
}

// ── Esencial (Estilos, #987) ─────────────────────────────────────────────────

/**
 * `qk.tareas.byProject(f)`: the Tareas Esencial cards (counts per project and
 * the open rows, at most 200). The filters come resolved (a null responsable
 * is everyone). FORBIDDEN without Tareas. Read-only.
 */
export async function getTareasByProject(input: z.input<typeof TareasFiltersInput>): Promise<TareasByProject> {
  const parsed = parseInput(TareasFiltersInput, input);
  return loadTareasByProject(await requireCapabilityUser(), parsed);
}

// ── Analítico summary (Estilos, #988) ────────────────────────────────────────

/**
 * `qk.tareas.summary(f)`: the Tareas Analítico counts per project and etapa,
 * per project and in total (one grouping-sets query), plus the same filters
 * without `mostrar`. FORBIDDEN without Tareas. Read-only.
 */
export async function getTareasSummary(input: z.input<typeof TareasFiltersInput>): Promise<TareasSummary> {
  const parsed = parseInput(TareasFiltersInput, input);
  return loadTareasSummary(await requireCapabilityUser(), parsed);
}
