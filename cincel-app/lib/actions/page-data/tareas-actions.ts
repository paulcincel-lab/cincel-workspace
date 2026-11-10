"use server";

import {
  loadTareasBoard,
  loadTareasBoardColumn,
  loadTareasByProject,
  loadTareasFacets,
  loadTareasListPage,
  loadTareasPage,
  loadTareasSummary,
  loadTareasTrend,
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
  TareasListPageInput,
  TareasPageInput,
} from "@/lib/tareas/page-input";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import { loadTareasCalendar, loadTareasStartSlot, loadTaskSheet, searchProjectTasks } from "@/lib/loaders/tareas";
import type { TareasStartSlotData } from "@/lib/types/tareas-start-slot";
import type { TaskSheetData } from "@/lib/types/task-sheet";
import { TAREAS_MOSTRAR, TAREAS_SEARCH_MAX } from "@/lib/tareas/query";
import type { TaskListRow, TaskRef } from "@/lib/types/core";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

// ── Calendario (Query Migration 4c, #957) ────────────────────────────────────

/** Longest range one calendar call may ask for (the month grid plus the previous week fits). */
const CALENDAR_MAX_DAYS = 62;

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const TareasListFiltersInput = z.object({
  tramo: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .nullable(),
  proyecto: UuidSchema.nullable(),
  responsable: z.union([z.literal("yo"), z.literal("todos"), UuidSchema]).nullable(),
  estado: z.enum(["pendiente", "en_proceso", "completado", "bloqueado"]).nullable(),
  q: z.string().max(TAREAS_SEARCH_MAX).nullable(),
  mostrar: z.enum(TAREAS_MOSTRAR).optional(),
});

const TareasCalendarInput = z
  .object({ filters: TareasListFiltersInput, from: z.iso.date(), to: z.iso.date() })
  .refine((v) => v.to >= v.from, { path: ["to"] })
  .refine((v) => daysBetween(v.from, v.to) <= CALENDAR_MAX_DAYS, { path: ["to"] });

/**
 * `qk.tareas.calendar(f, from, to)` (Query Migration 4c, #957): the slim task
 * rows with a date in the inclusive range. Parses the input (a range over 62
 * days or reversed is INVALID), requires a staff session and hands the viewer
 * to the loader, which requires the Tareas capability (FORBIDDEN otherwise).
 * Read-only.
 */
export async function getTareasCalendarData(input: z.input<typeof TareasCalendarInput>): Promise<TaskListRow[]> {
  const parsed = parseInput(TareasCalendarInput, input);
  return loadTareasCalendar(await requireCapabilityUser(), parsed);
}

// ── Start slot (Query Migration 4d, #958) ────────────────────────────────────

const TareasStartSlotInput = z.object({ tramoId: UuidSchema });

/**
 * `qk.tareas.startSlot(tramoId)` (Query Migration 4d, #958): the Lista start
 * slot of one tramo (board, candidates `{id,name,suggested}`, `canStart`).
 * Parses the input, requires a staff session and hands the viewer to the
 * loader, which requires the Tareas capability (FORBIDDEN otherwise). Null
 * when the tramo is missing or inactive. Read-only.
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
 * call (facets, tramos, `{id,name}` staff, and the Lista first page or every
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
 * `qk.tareas.summary(f)`: the Tareas Analítico counts per project and tramo,
 * per project and in total (one grouping-sets query), plus the same filters
 * without `mostrar`. FORBIDDEN without Tareas. Read-only.
 */
export async function getTareasSummary(input: z.input<typeof TareasFiltersInput>): Promise<TareasSummary> {
  const parsed = parseInput(TareasFiltersInput, input);
  return loadTareasSummary(await requireCapabilityUser(), parsed);
}
