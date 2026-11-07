/**
 * Assistant tool group "Consulta y búsqueda (4): search_workspace, get_project, get_task, list_my_tasks" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * All four are reads: no approval, nothing written. Every read goes through
 * the viewer-scoped actions, so admin tasks and client / origin data stay
 * hidden without `canSeeAdminData` (BE §9.7); the tools also drop those
 * fields themselves.
 */
import "server-only";

import { z } from "zod";

import { IMPLEMENTED as SEARCH_IMPLEMENTED } from "@/lib/actions/search-actions.flags";
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { fetchScheduleAction } from "@/lib/actions/schedule-actions";
import { searchWorkspaceAction } from "@/lib/actions/search-actions";
import { fetchMyTasksAction, fetchTaskAction, fetchTasksAction } from "@/lib/actions/tasks-actions";
import { defineTool, type DefinedTool, type ToolRunContext } from "@/lib/assistant/define-tool";
import { resolveProject } from "@/lib/assistant/resolvers";
import {
  summarizeGetProject,
  summarizeGetTask,
  summarizeListMyTasks,
  summarizeSearchWorkspace,
  taskStatusLabel,
} from "@/lib/assistant/tool-summaries";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData } from "@/lib/auth/permissions";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import type { HistoryEvent, ProjectDetail, TaskDetail, TaskListItem, TaskStatus } from "@/lib/types/core";
import type { SearchResult } from "@/lib/types/redesign";
import type { ScheduleTask } from "@/lib/types/schedule";

const SEARCH_TYPES = ["proyecto", "tarea", "persona", "archivo", "nota"] as const;
export const TASK_STATUSES = ["pendiente", "en_proceso", "completado", "bloqueado"] as const;
export const OPEN_STATUSES: TaskStatus[] = ["pendiente", "en_proceso", "bloqueado"];

/** "Today" for due dates, in the firm's timezone (the same one the Cronograma uses). */
const TIMEZONE = "America/Mexico_City";

export function todayInMexico(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    now,
  );
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** What a tool returns instead of throwing when the input names nothing usable. */
export type ToolFailure = { ok: false; error: string; message: string; candidates?: string[] };

export function failure(error: string, message?: string, candidates?: string[]): ToolFailure {
  return { ok: false, error, message: message ?? actionErrorText(error), ...(candidates?.length ? { candidates } : {}) };
}

const always = () => true;

// ── Shapes returned to the model ────────────────────────────────────────────

function historyLine(event: HistoryEvent) {
  return {
    at: event.eventAt,
    kind: event.kind,
    actor: event.actor?.name ?? null,
    field: event.field,
    before: event.beforeValue,
    after: event.afterValue,
    comment: event.comment,
  };
}

export function taskSummary(task: TaskListItem, user: AuthenticatedUser) {
  const admin = canSeeAdminData(user);
  return {
    id: task.id,
    title: task.title,
    status: task.customStatus?.name ?? taskStatusLabel(task.status),
    baseStatus: task.status,
    priority: task.priority,
    project: { id: task.project.id, name: task.project.name, ...(admin ? { client: task.project.clientName } : {}) },
    tramo: task.workflow?.name ?? null,
    fase: task.phase?.name ?? null,
    espacio: task.space?.name ?? null,
    manager: task.manager?.name ?? null,
    support: task.support.map((s) => s.name),
    commitmentDate: task.commitmentDate,
    reviewDate: task.reviewDate,
    deliveryDate: task.deliveryDate,
    checklist: task.checklist,
    waitingOn: task.waitingOn,
    url: `/tareas?tarea=${task.id}`,
  };
}

export function taskDetailView(task: TaskDetail, user: AuthenticatedUser) {
  return {
    ...taskSummary(task, user),
    notes: task.notes,
    createdBy: task.createdBy.name,
    parentTitle: task.parentTitle,
    subtasks: { total: task.subtaskCount, done: task.subtaskDoneCount },
    checklistItems: task.checklistItems.map((item) => ({ id: item.id, title: item.title, done: item.completed })),
    attachments: task.attachments.length,
    links: task.links.map((link) => ({ title: link.title, kind: link.kind, url: link.url })),
    history: task.history.slice(0, 10).map(historyLine),
  };
}

/** Cronograma totals for `get_project` (BE §10.3 "schedule summary"). Null without partidas. */
export function scheduleSummary(tasks: ScheduleTask[], today: string) {
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "progress").length;
  const late = tasks.filter((t) => t.status !== "done" && t.fin < today).sort((a, b) => a.fin.localeCompare(b.fin));
  const upcoming = tasks
    .filter((t) => t.status === "pending" && t.inicio >= today)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .slice(0, 5);
  const starts = tasks.map((t) => t.inicio).sort();
  const ends = tasks.map((t) => t.fin).sort();
  return {
    partidas: tasks.length,
    done,
    inProgress,
    pending: tasks.length - done - inProgress,
    donePct: Math.round((done / tasks.length) * 100),
    late: late.length,
    lateItems: late.slice(0, 5).map((t) => ({ tarea: t.tarea, seccion: t.seccion, fin: t.fin, responsable: t.responsable })),
    upcoming: upcoming.map((t) => ({ tarea: t.tarea, seccion: t.seccion, inicio: t.inicio, responsable: t.responsable })),
    start: starts[0],
    end: ends[ends.length - 1],
  };
}

export function projectView(project: ProjectDetail, user: AuthenticatedUser) {
  const admin = canSeeAdminData(user);
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    status: project.status,
    projectType: project.projectType,
    progress: project.progress,
    currentTramo: project.currentWorkflow?.name ?? null,
    needsTramo: project.needsTramo,
    tramos: project.tramos.map((t) => ({ name: t.name, startedAt: t.startedAt, closedAt: t.closedAt, current: t.current })),
    manager: project.manager?.name ?? null,
    coordinator: project.coordinator?.name ?? null,
    startDate: project.startDate,
    endDate: project.endDate,
    address: [project.addressStreet, project.addressCity, project.addressState].filter(Boolean).join(", ") || null,
    members: project.members.filter((m) => m.active).map((m) => ({ name: m.name, role: m.role })),
    // Client contacts, client, origin and amounts are admin-only data (BE §9.7).
    contacts: project.contacts
      .filter((c) => admin || c.type !== "cliente")
      .map((c) => ({ name: c.name, type: c.type, role: c.role })),
    links: project.links.map((l) => ({ title: l.title, kind: l.kind, url: l.url })),
    ...(admin
      ? {
          client: project.client?.name ?? null,
          origin: project.origin,
          originStaff: project.originStaff?.name ?? null,
          contractAmountMxn: project.contractAmountMxn,
        }
      : {}),
    url: `/proyectos/${project.id}`,
  };
}

// ── search_workspace ────────────────────────────────────────────────────────

const searchSchema = z.object({
  query: z.string().trim().min(2).max(120).describe("Texto a buscar"),
  types: z
    .array(z.enum(SEARCH_TYPES))
    .max(SEARCH_TYPES.length)
    .optional()
    .describe("Limita la búsqueda a estos tipos: proyecto, tarea, persona, archivo, nota"),
  limit: z.number().int().min(1).max(30).optional().describe("Máximo de resultados (10 por defecto)"),
});

function searchErrorText(err: unknown): string {
  switch (actionErrorCode(err)) {
    case "INVALID":
      return "Escribe al menos 2 caracteres para buscar.";
    case "RATE_LIMITED":
      return "Demasiadas búsquedas seguidas. Espera un momento e intenta de nuevo.";
    default:
      return actionErrorText(err);
  }
}

export const search_workspace = defineTool({
  name: "search_workspace",
  description:
    "Busca en Cincel proyectos, tareas, personas, archivos y tus notas por nombre o texto. Devuelve solo lo que el usuario puede ver, con un enlace a cada resultado. Úsalo para localizar algo antes de consultarlo con get_project o get_task.",
  schema: searchSchema,
  capability: always,
  available: () => SEARCH_IMPLEMENTED.searchWorkspaceAction,
  confirm: false,
  write: false,
  summarize: summarizeSearchWorkspace,
  async run(_ctx, input) {
    const limit = input.limit ?? 10;
    let results: SearchResult[];
    try {
      // The action scopes every type to what the viewer can see (BE §8.9).
      results = await searchWorkspaceAction({ query: input.query, types: input.types, limit });
    } catch (err) {
      return failure(actionErrorCode(err) || "ERROR", searchErrorText(err));
    }
    const allowed = input.types?.length ? new Set<string>(input.types) : null;
    const rows = results
      .filter((r) => !allowed || allowed.has(r.type))
      .slice(0, limit)
      .map((r) => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle, url: r.url }));
    return { ok: true as const, query: input.query, count: rows.length, results: rows };
  },
});

// ── get_project ─────────────────────────────────────────────────────────────

const getProjectSchema = z.object({
  project: z
    .string()
    .trim()
    .min(2)
    .optional()
    .describe("Nombre del proyecto; si se omite, el proyecto de la página actual"),
});

/** The project id the input names, or the page's project (BE §8.10 context default). */
export async function projectIdFor(
  ctx: ToolRunContext,
  name: string | undefined,
): Promise<{ ok: true; id: string; name?: string } | ToolFailure> {
  if (name) {
    const resolved = await resolveProject(name);
    if (!resolved.ok) return failure("NOT_FOUND", resolved.error, resolved.candidates);
    return { ok: true, id: resolved.value.id, name: resolved.value.name };
  }
  if (ctx.context.projectId) return { ok: true, id: ctx.context.projectId };
  return failure("INVALID", "Indica el nombre del proyecto.");
}

export const get_project = defineTool({
  name: "get_project",
  description:
    "Consulta un proyecto: estatus, avance, tramo actual, responsables, equipo, fechas, enlaces, tareas abiertas y vencidas, y el resumen del cronograma (partidas hechas, atrasadas y próximas). Sin nombre usa el proyecto de la página actual.",
  schema: getProjectSchema,
  capability: always,
  available: always,
  confirm: false,
  write: false,
  summarize: summarizeGetProject,
  async run(ctx, input) {
    const target = await projectIdFor(ctx, input.project);
    if (!target.ok) return target;

    const project = await fetchProjectAction(target.id);
    if (!project) return failure("NOT_FOUND", "No se encontró el proyecto o no tienes acceso a él.");

    const today = todayInMexico();
    const [openTasks, schedule] = await Promise.all([
      fetchTasksAction({ projectId: project.id, status: OPEN_STATUSES }),
      // Only after the scoped read above confirmed the viewer sees the project.
      fetchScheduleAction(project.id),
    ]);
    const overdue = openTasks
      .filter((t) => t.commitmentDate !== null && t.commitmentDate < today)
      .sort((a, b) => (a.commitmentDate ?? "").localeCompare(b.commitmentDate ?? ""));
    return {
      ok: true as const,
      project: projectView(project, ctx.user),
      tasks: {
        open: openTasks.length,
        blocked: openTasks.filter((t) => t.status === "bloqueado").length,
        overdue: overdue.length,
        overdueItems: overdue.slice(0, 10).map((t) => ({
          id: t.id,
          title: t.title,
          commitmentDate: t.commitmentDate,
          manager: t.manager?.name ?? null,
        })),
      },
      schedule: schedule ? scheduleSummary(schedule.data.tasks, schedule.today) : null,
    };
  },
});

// ── get_task ────────────────────────────────────────────────────────────────

const getTaskSchema = z.object({
  taskId: z.guid().optional().describe("Id de la tarea"),
  title: z.string().trim().min(3).optional().describe("Título o fragmento del título, si no tienes el id"),
  project: z.string().trim().min(2).optional().describe("Proyecto de la tarea, junto con el título"),
});

/**
 * The one visible task the input names (BE §10.3: `taskId`, or title +
 * project; nothing → the page's task). Admin tasks of non-admins read as
 * missing, like the actions return them.
 */
export async function findTask(
  ctx: ToolRunContext,
  input: { taskId?: string; title?: string; project?: string },
): Promise<{ ok: true; task: TaskDetail } | ToolFailure> {
  const taskId = input.taskId ?? (input.title ? undefined : ctx.context.taskId);
  if (taskId) {
    const task = await fetchTaskAction(taskId);
    if (!task) return failure("NOT_FOUND", "No se encontró la tarea o no tienes acceso a ella.");
    return { ok: true, task };
  }
  if (!input.title) return failure("INVALID", "Indica el id de la tarea o su título y proyecto.");

  let projectId: string | undefined;
  if (input.project) {
    const resolved = await resolveProject(input.project);
    if (!resolved.ok) return failure("NOT_FOUND", resolved.error, resolved.candidates);
    projectId = resolved.value.id;
  } else if (ctx.context.projectId) {
    projectId = ctx.context.projectId;
  }

  const matches = await fetchTasksAction({ search: input.title, projectId });
  const q = input.title.trim().toLowerCase();
  const exact = matches.filter((t) => t.title.trim().toLowerCase() === q);
  const pick = exact.length === 1 ? exact : matches;
  if (pick.length === 0) return failure("NOT_FOUND", `No se encontró ninguna tarea que contenga "${input.title}".`);
  if (pick.length > 1) {
    return failure(
      "AMBIGUOUS",
      `"${input.title}" coincide con ${pick.length} tareas. Indica el proyecto o el id.`,
      pick.slice(0, 10).map((t) => `${t.title} (${t.project.name}) · ${t.id}`),
    );
  }
  const task = await fetchTaskAction(pick[0].id);
  if (!task) return failure("NOT_FOUND", "No se encontró la tarea o no tienes acceso a ella.");
  return { ok: true, task };
}

export const get_task = defineTool({
  name: "get_task",
  description:
    "Consulta una tarea con su estatus, responsables, fechas, checklist, enlaces y los últimos movimientos de su bitácora. Acepta el id de la tarea, o su título y proyecto; sin nada usa la tarea de la página actual.",
  schema: getTaskSchema,
  capability: always,
  available: always,
  confirm: false,
  write: false,
  summarize: summarizeGetTask,
  async run(ctx, input) {
    const found = await findTask(ctx, input);
    if (!found.ok) return found;
    return { ok: true as const, task: taskDetailView(found.task, ctx.user) };
  },
});

// ── list_my_tasks ───────────────────────────────────────────────────────────

const listMyTasksSchema = z.object({
  status: z
    .array(z.enum(TASK_STATUSES))
    .min(1)
    .optional()
    .describe("Estatus a incluir; por defecto las abiertas (pendiente, en_proceso, bloqueado)"),
  due: z.enum(["hoy", "semana", "vencidas"]).optional().describe("Solo las que vencen hoy, esta semana o ya vencidas"),
});

/** Keeps the tasks whose commitment date falls in the `due` window (BE §10.3). */
export function filterByDue(
  tasks: TaskListItem[],
  due: "hoy" | "semana" | "vencidas" | undefined,
  today: string,
): TaskListItem[] {
  if (!due) return tasks;
  if (due === "hoy") return tasks.filter((t) => t.commitmentDate === today);
  if (due === "semana") {
    const end = addDays(today, 6);
    return tasks.filter((t) => t.commitmentDate !== null && t.commitmentDate >= today && t.commitmentDate <= end);
  }
  return tasks.filter((t) => t.status !== "completado" && t.commitmentDate !== null && t.commitmentDate < today);
}

export const list_my_tasks = defineTool({
  name: "list_my_tasks",
  description:
    "Lista las tareas del usuario (de las que es responsable o apoyo), abiertas por defecto y ordenadas por fecha de entrega. Filtra por estatus y por vencimiento: hoy, esta semana o vencidas.",
  schema: listMyTasksSchema,
  capability: always,
  available: always,
  confirm: false,
  write: false,
  summarize: summarizeListMyTasks,
  async run(ctx, input) {
    const rows = await fetchMyTasksAction({ status: input.status ?? OPEN_STATUSES });
    const visible = canSeeAdminData(ctx.user) ? rows : rows.filter((t) => t.kind !== "admin");
    const due = filterByDue(visible, input.due, todayInMexico());
    const sorted = [...due].sort((a, b) => (a.commitmentDate ?? "9999").localeCompare(b.commitmentDate ?? "9999"));
    return {
      ok: true as const,
      count: sorted.length,
      tasks: sorted.slice(0, 50).map((t) => taskSummary(t, ctx.user)),
    };
  },
});

export const tools: DefinedTool[] = [search_workspace, get_project, get_task, list_my_tasks] as unknown as DefinedTool[];
