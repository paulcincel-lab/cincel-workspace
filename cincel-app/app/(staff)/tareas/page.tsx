import { notFound } from "next/navigation";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { TareasClient, type TareasClientProps } from "@/components/tareas/TareasClient";
import {
  fetchBoardAction,
  fetchCalendarAction,
  fetchMyTasksAction,
  fetchTasksAction,
} from "@/lib/actions/tasks-actions";
import { fetchAssignableStaffAction } from "@/lib/actions/staff-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { listTramos } from "@/lib/tramos/compat";
import { parseTareasQuery, tareasCalendarRange, toUrlSearchParams, type TareasQuery } from "@/lib/tareas/query";
import type { TaskFilters, TaskStatus, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle, TaskBoard } from "@/lib/types/redesign";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

type SearchParams = Record<string, string | string[] | undefined>;

const EMPTY_BOARD: TaskBoard = { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** `?estilo=` overrides the style for this render only (FE §4.2). */
function estiloOverride(sp: URLSearchParams): PresentationStyle | null {
  const value = sp.get("estilo");
  return value && (STYLES as readonly string[]).includes(value) ? (value as PresentationStyle) : null;
}

/**
 * Filters every view shares, minus tramo and proyecto: the tasks list loaded
 * with them feeds the tramo chip counts and the Proyecto options, so picking
 * a chip or a project never hides the other choices.
 */
function baseFilters(query: TareasQuery, staffId: string): TaskFilters {
  const filters: TaskFilters = {};
  if (query.q) filters.search = query.q;
  if (query.estado) filters.status = query.estado as TaskStatus;
  if (query.responsable) filters.involvesStaffId = query.responsable === "yo" ? staffId : query.responsable;
  return filters;
}

/**
 * `/tareas` (redesign FE §2.1, §3.4): reads the query, loads the selected
 * view's data with the filters (board, tasks or calendar), the assignable
 * staff and the tramos, and hands them to `TareasClient`.
 */
export default async function TareasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;

  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canViewActivities) notFound();

  const sp = toUrlSearchParams(raw);
  const query = parseTareasQuery(sp);
  const appearance = await getResolvedAppearance();
  const estilo = estiloOverride(sp);

  let tramos: WorkflowRef[] = [];
  try {
    tramos = await listTramos();
  } catch (err) {
    console.error("[tareas] tramos", err);
  }
  const tramo = query.tramo ? (tramos.find((t) => t.key === query.tramo) ?? null) : null;

  const base = baseFilters(query, user.member.id);
  const viewFilters: TaskFilters = { ...base };
  if (tramo) viewFilters.workflowId = tramo.id;
  if (query.proyecto) viewFilters.projectId = query.proyecto;
  // A tramo key no workflow has matches no task: the view loads nothing.
  const unknownTramo = query.tramo !== null && tramo === null;

  // Board and calendar only for their view; nothing to load for a tramo key no workflow has.
  const loadBoard = () =>
    query.vista !== "tablero" ? undefined : unknownTramo ? EMPTY_BOARD : fetchBoardAction(viewFilters);
  const loadCalendar = () => {
    if (query.vista !== "calendario") return undefined;
    if (unknownTramo) return [];
    const range = tareasCalendarRange(query.cal, new Date());
    return fetchCalendarAction(range.from, range.to, viewFilters);
  };

  const initial: TareasClientProps["initial"] = { tasks: [] };
  let staff: TareasClientProps["staff"] = [];
  try {
    const [tasks, board, calendar, staffRows] = await Promise.all([
      // "Responsable: Yo" is Mis tareas: the viewer's own tasks, an admin's own admin tasks included.
      query.responsable === "yo" ? fetchMyTasksAction(base) : fetchTasksAction(base),
      loadBoard(),
      loadCalendar(),
      fetchAssignableStaffAction(tramo?.id ?? null),
    ]);
    initial.tasks = tasks;
    if (board) initial.board = board;
    if (calendar) initial.calendar = calendar;
    staff = staffRows;
  } catch (err) {
    console.error("[tareas] load", err);
  }

  return (
    <StyleProvider style={estilo ?? appearance.style} scope="staff" isOverridden={estilo !== null}>
      <TareasClient query={query} initial={initial} staff={staff} tramos={tramos} />
    </StyleProvider>
  );
}
