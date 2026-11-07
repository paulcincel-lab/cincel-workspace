/**
 * Assistant tool group "Tareas (6): update_task_status, reschedule_task, add_task_comment, add_checklist_item, create_tasks_from_notes, rebalance_workload" (redesign BE §10.3; Phase 7).
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * and `available(ctx)` reading only the flags modules (Rule 3).
 *
 * Every tool here writes, so each one is `write: true`: it asks for approval
 * whenever the turn already holds an untrusted result (review N4), even the
 * direct ones (`update_task_status`, `add_checklist_item`). Tasks are shared
 * entities, so each write appends a "<resumen> (vía asistente)" comment to the
 * task's bitácora (BE §9.9). Nothing here deletes; the task actions archive.
 */
import "server-only";

import { z } from "zod";

import { IMPLEMENTED as GMAIL_IMPLEMENTED } from "@/lib/actions/gmail-actions.flags";
import { fetchGmailThreadAction } from "@/lib/actions/gmail-actions";
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { fetchAssignableStaffAction } from "@/lib/actions/staff-actions";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import {
  addChecklistItemAction,
  addTaskCommentAction,
  assignTaskAction,
  createUserTaskAction,
  fetchTasksAction,
  setTaskCustomStatusAction,
  setTaskStatusAction,
  updateChecklistItemAction,
  updateTaskAction,
} from "@/lib/actions/tasks-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { defineTool, type DefinedTool } from "@/lib/assistant/define-tool";
import { extractTaskTitles, MAX_TASKS_FROM_NOTES } from "@/lib/assistant/notes-to-tasks";
import { resolveStaff } from "@/lib/assistant/resolvers";
import { formatDueDate, taskStatusLabel, toolSummaries } from "@/lib/assistant/tool-summaries";
import { failure, OPEN_STATUSES, findTask, projectIdFor } from "@/lib/assistant/tools/consulta";
import { recordViaAsistente, viaAsistente } from "@/lib/assistant/via-asistente";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import { notify } from "@/lib/notifications/notify";
import type { Staff, TaskDetail, TaskListItem, TaskPriority, TaskStatus, WorkflowDetail } from "@/lib/types/core";

// ── Capabilities (BE §10.1 shorthands) ──────────────────────────────────────

const LEAD_ROLES: readonly string[] = ["Jefe de Taller", "Jefe de Construcción"];

/** **lead**: access Administrador or Dirección, or role Jefe de Taller / Jefe de Construcción. */
export function isLead(user: AuthenticatedUser): boolean {
  if (user.access === "Administrador" || user.access === "Dirección") return true;
  return LEAD_ROLES.includes(user.access) || LEAD_ROLES.includes(user.member.role);
}

/** **act-assign** = `activities.canChangeResponsible`. */
export function canAssign(user: AuthenticatedUser): boolean {
  return resolveActivitiesCapabilities(user).canChangeResponsible;
}

/** **act-create** = `activities.canCreateActivity`. */
export function canCreate(user: AuthenticatedUser): boolean {
  return resolveActivitiesCapabilities(user).canCreateActivity;
}

/** Some status change is allowed; the per-task rule (`canChangeActivityStatus`) runs in `run`. */
export function canChangeSomeStatus(user: AuthenticatedUser): boolean {
  return resolveActivitiesCapabilities(user).statusScope !== "none";
}

const always = () => true;

// ── Helpers ─────────────────────────────────────────────────────────────────

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();
}

function quoted(title: string): string {
  return `«${title}»`;
}

/** An action error as a tool result (Spanish copy through `actionErrorText`, FE §9). */
function actionFailure(err: unknown) {
  return failure(actionErrorCode(err) || "ERROR", actionErrorText(err));
}

const taskIdSchema = z.guid().describe("Id de la tarea (de get_task, list_my_tasks o search_workspace)");

const BASE_STATUSES: readonly TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

/** A base status from its key or label ("en proceso", "En Proceso", "en_proceso"). */
export function baseStatusOf(value: string): TaskStatus | null {
  const key = fold(value);
  return BASE_STATUSES.find((s) => fold(s) === key || fold(taskStatusLabel(s)) === key) ?? null;
}

// ── update_task_status ──────────────────────────────────────────────────────

const updateStatusSchema = z.object({
  taskId: taskIdSchema,
  status: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .describe("Nuevo estatus: pendiente, en_proceso, completado, bloqueado o el nombre de un estatus propio"),
  note: z.string().trim().max(500).optional().describe("Motivo o nota breve para la bitácora"),
});

export const update_task_status = defineTool({
  name: "update_task_status",
  description:
    "Cambia el estatus de una tarea (pendiente, en proceso, completado, bloqueado o un estatus propio de la organización). Solo si el usuario puede cambiar el estatus de esa tarea. Deja constancia en la bitácora.",
  schema: updateStatusSchema,
  capability: canChangeSomeStatus,
  available: always,
  confirm: false,
  write: true,
  summarize: toolSummaries.update_task_status,
  async run(ctx, input) {
    const found = await findTask(ctx, { taskId: input.taskId });
    if (!found.ok) return found;
    const task = found.task;

    const capabilities = resolveActivitiesCapabilities(ctx.user);
    if (!canChangeActivityStatus({ capabilities, task, viewerId: ctx.user.member.id })) {
      return failure("FORBIDDEN", "No puedes cambiar el estatus de esta tarea: no eres su responsable ni su apoyo.");
    }

    const before = task.customStatus?.name ?? taskStatusLabel(task.status);
    let updated: TaskDetail;
    let label: string;
    try {
      const base = baseStatusOf(input.status);
      if (base) {
        updated = await setTaskStatusAction(task.id, base);
        label = taskStatusLabel(base);
      } else {
        const options = await fetchTaskStatusesAction();
        const option = options.find((o) => fold(o.name) === fold(input.status));
        if (!option) {
          return failure(
            "INVALID",
            `"${input.status}" no es un estatus. Usa pendiente, en proceso, completado, bloqueado o uno de los estatus propios.`,
            options.map((o) => o.name),
          );
        }
        updated = await setTaskCustomStatusAction(task.id, option.id);
        label = option.name;
      }
    } catch (err) {
      return actionFailure(err);
    }

    const summary = `Estatus de ${quoted(task.title)}: ${before} → ${label}${input.note ? `. ${input.note}` : ""}`;
    await recordViaAsistente({ entity: "task", entityId: task.id, actorId: ctx.user.member.id, summary });
    return {
      ok: true as const,
      id: updated.id,
      title: updated.title,
      status: updated.customStatus?.name ?? taskStatusLabel(updated.status),
      previous: before,
    };
  },
});

// ── reschedule_task ─────────────────────────────────────────────────────────

const rescheduleSchema = z.object({
  taskId: taskIdSchema,
  dueDate: z.iso.date().describe("Nueva fecha de entrega YYYY-MM-DD"),
  reason: z.string().trim().max(500).optional().describe("Motivo del cambio"),
});

export const reschedule_task = defineTool({
  name: "reschedule_task",
  description:
    "Mueve la fecha de entrega (compromiso) de una tarea y avisa a su responsable y apoyo. Pide confirmación al usuario antes de aplicarlo.",
  schema: rescheduleSchema,
  capability: canAssign,
  available: always,
  confirm: true,
  write: true,
  summarize: toolSummaries.reschedule_task,
  async run(ctx, input) {
    const found = await findTask(ctx, { taskId: input.taskId });
    if (!found.ok) return found;
    const task = found.task;
    const before = task.commitmentDate;

    let updated: TaskDetail;
    try {
      updated = await updateTaskAction(task.id, { commitmentDate: input.dueDate });
    } catch (err) {
      return actionFailure(err);
    }

    const from = before ? formatDueDate(before) : "sin fecha";
    const summary = `Entrega de ${quoted(task.title)}: ${from} → ${formatDueDate(input.dueDate)}${input.reason ? `. ${input.reason}` : ""}`;
    await recordViaAsistente({ entity: "task", entityId: task.id, actorId: ctx.user.member.id, summary });

    const recipients = [updated.managerId, ...updated.support.map((s) => s.id)].filter(
      (id): id is string => !!id,
    );
    let notified = 0;
    if (recipients.length > 0) {
      try {
        const result = await notify(db, [...new Set(recipients)], {
          kind: "sistema",
          title: `Nueva fecha de entrega: ${task.title}`,
          body: `${formatDueDate(input.dueDate)}${input.reason ? ` · ${input.reason}` : ""}`,
          entity: "task",
          entityId: task.id,
          url: `/tareas?tarea=${task.id}`,
          dedupeKey: `reprogramar:${task.id}:${input.dueDate}`,
          actorId: ctx.user.member.id,
        });
        notified = result.created;
      } catch (err) {
        // The date already moved; a failed notice must not undo or hide that.
        console.error(JSON.stringify({ event: "assistant.notify_failed", tool: "reschedule_task", taskId: task.id, error: String(err) }));
      }
    }

    return {
      ok: true as const,
      id: updated.id,
      title: updated.title,
      previousDueDate: before,
      dueDate: updated.commitmentDate,
      notified,
    };
  },
});

// ── add_task_comment ────────────────────────────────────────────────────────

const commentSchema = z.object({
  taskId: taskIdSchema,
  text: z.string().trim().min(1).max(4000).describe("Texto del comentario"),
  mentions: z.array(z.string().trim().min(2)).max(10).optional().describe("Personas a mencionar, por nombre"),
});

export const add_task_comment = defineTool({
  name: "add_task_comment",
  description:
    "Publica un comentario en la bitácora de una tarea, con menciones opcionales a personas del equipo. Pide confirmación al usuario antes de publicarlo.",
  schema: commentSchema,
  capability: always,
  available: always,
  confirm: true,
  write: true,
  summarize: toolSummaries.add_task_comment,
  async run(ctx, input) {
    const found = await findTask(ctx, { taskId: input.taskId });
    if (!found.ok) return found;

    const mentioned: string[] = [];
    for (const name of input.mentions ?? []) {
      const resolved = await resolveStaff(name);
      if (!resolved.ok) return failure("NOT_FOUND", resolved.error, resolved.candidates);
      const full = [resolved.value.name, resolved.value.lastName].filter(Boolean).join(" ");
      if (!mentioned.includes(full)) mentioned.push(full);
    }

    // The comment is itself the bitácora entry, so it carries the suffix
    // instead of a second "vía asistente" row (BE §9.9).
    const body = [mentioned.map((n) => `@${n}`).join(" "), input.text].filter(Boolean).join(" ");
    try {
      const event = await addTaskCommentAction(found.task.id, viaAsistente(body));
      return { ok: true as const, id: event.id, taskId: found.task.id, title: found.task.title, mentioned };
    } catch (err) {
      return actionFailure(err);
    }
  },
});

// ── add_checklist_item ──────────────────────────────────────────────────────

const checklistSchema = z.object({
  taskId: taskIdSchema,
  item: z.string().trim().min(2).max(300).describe("Texto del punto del checklist"),
  done: z.boolean().optional().describe("Marcarlo como hecho al agregarlo"),
});

export const add_checklist_item = defineTool({
  name: "add_checklist_item",
  description:
    "Agrega un punto al checklist de una tarea (opcionalmente ya marcado como hecho). Lo puede hacer el responsable de la tarea o quien puede reasignar tareas.",
  schema: checklistSchema,
  capability: always,
  available: always,
  confirm: false,
  write: true,
  summarize: toolSummaries.add_checklist_item,
  async run(ctx, input) {
    const found = await findTask(ctx, { taskId: input.taskId });
    if (!found.ok) return found;
    const task = found.task;
    // BE §10.3: the task's manager or **act-assign**.
    if (task.managerId !== ctx.user.member.id && !canAssign(ctx.user)) {
      return failure("FORBIDDEN", "Solo el responsable de la tarea o quien puede reasignar tareas agrega puntos al checklist.");
    }

    try {
      let item = await addChecklistItemAction(task.id, input.item);
      if (input.done) item = await updateChecklistItemAction(item.id, { completed: true });
      const summary = `Checklist de ${quoted(task.title)}: + ${quoted(item.title)}${item.completed ? " (hecho)" : ""}`;
      await recordViaAsistente({ entity: "task", entityId: task.id, actorId: ctx.user.member.id, summary });
      return { ok: true as const, taskId: task.id, item: { id: item.id, title: item.title, done: item.completed } };
    } catch (err) {
      return actionFailure(err);
    }
  },
});

// ── create_tasks_from_notes ─────────────────────────────────────────────────

const fromNotesSchema = z
  .object({
    text: z.string().trim().min(3).max(8000).optional().describe("Notas o minuta: una tarea por línea o viñeta"),
    emailThreadId: z.string().trim().min(1).optional().describe("Hilo de Gmail del que sacar las tareas"),
    project: z.string().trim().min(2).optional().describe("Proyecto; si se omite, el de la página actual"),
  })
  .refine((v) => !!v.text !== !!v.emailThreadId, { message: "Indica text o emailThreadId, solo uno." });

/**
 * The newest message's own text: quoted replies (">"), the "El … escribió:" /
 * "On … wrote:" tail and the signature ("-- ") are dropped.
 */
export function emailBodyForTasks(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*(El|On)\s.+(escribió|wrote):\s*$/i.test(line)) break;
    if (/^--\s*$/.test(line)) break;
    lines.push(line);
  }
  return lines.join("\n");
}

export const create_tasks_from_notes = defineTool({
  name: "create_tasks_from_notes",
  description: `Crea varias tareas en un proyecto a partir de notas o de un correo: una tarea por línea o viñeta (máximo ${MAX_TASKS_FROM_NOTES}), en el tramo actual del proyecto. Pide confirmación al usuario antes de crearlas.`,
  schema: fromNotesSchema,
  capability: canCreate,
  available: always,
  confirm: true,
  write: true,
  summarize: toolSummaries.create_tasks_from_notes,
  async run(ctx, input) {
    const target = await projectIdFor(ctx, input.project);
    if (!target.ok) return target;
    const project = await fetchProjectAction(target.id);
    if (!project) return failure("NOT_FOUND", "No se encontró el proyecto o no tienes acceso a él.");
    if (!project.currentWorkflow) {
      return failure("NOT_STARTED", `${quoted(project.name)} no tiene un tramo actual; inicia un tramo antes de crear tareas.`);
    }

    let source = input.text ?? "";
    let subject: string | null = null;
    if (input.emailThreadId) {
      if (!GMAIL_IMPLEMENTED.fetchGmailThreadAction) {
        return failure("DISABLED", "Leer correos de Gmail todavía no está disponible; copia el texto en el mensaje.");
      }
      try {
        const thread = await fetchGmailThreadAction(input.emailThreadId);
        const latest = thread.messages[thread.messages.length - 1];
        subject = thread.thread.subject;
        source = latest ? emailBodyForTasks(latest.text) : "";
      } catch (err) {
        return actionFailure(err);
      }
    }

    const titles = extractTaskTitles(source);
    if (titles.length === 0) return failure("EMPTY", "No encontré tareas en el texto: escribe una por línea.");

    const created: Array<{ id: string; title: string }> = [];
    for (const title of titles) {
      try {
        const task = await createUserTaskAction({
          projectId: project.id,
          title,
          workflowId: project.currentWorkflow.id,
          notes: subject ? `Desde el correo ${quoted(subject)}` : null,
        });
        created.push({ id: task.id, title: task.title });
        await recordViaAsistente({
          entity: "task",
          entityId: task.id,
          actorId: ctx.user.member.id,
          summary: subject ? `Creada desde el correo ${quoted(subject)}` : "Creada a partir de notas",
        });
      } catch (err) {
        return { ...actionFailure(err), created, pending: titles.slice(created.length) };
      }
    }

    const result = {
      ok: true as const,
      project: project.name,
      tramo: project.currentWorkflow.name,
      count: created.length,
      tasks: created,
    };
    // Titles taken from an email are third-party text (review N4).
    return input.emailThreadId ? { untrusted: true as const, content: result } : result;
  },
});

// ── rebalance_workload ──────────────────────────────────────────────────────

const rebalanceSchema = z.object({
  tramo: z.string().trim().min(2).optional().describe("Tramo a repartir (p. ej. Diseño); por defecto todos"),
  maxPerPerson: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Máximo de tareas abiertas por persona; por defecto la capacidad de cada quien"),
});

const DEFAULT_CAPACITY = 8;
const PRIORITY_RANK: Record<TaskPriority, number> = { baja: 0, media: 1, alta: 2 };

export type RebalanceMove = {
  taskId: string;
  title: string;
  project: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
};

export type RebalancePlan = {
  moves: RebalanceMove[];
  loads: Array<{ id: string; name: string; limit: number; before: number; after: number }>;
  /** People still over their limit after the plan (no one had room). */
  stillOver: string[];
  unassigned: number;
};

type Person = Pick<Staff, "id" | "name" | "capacity"> & { suggested?: boolean };

/**
 * Who gets which task (pure). The pool is everyone who already holds open work
 * in scope plus the staff suggested for the tramo. Only `pendiente` tasks move
 * (work in progress or blocked stays with its owner): lowest priority first,
 * then no date, then the latest date. Each goes to the person with the lowest
 * load-to-limit ratio who still has room.
 */
export function planRebalance(tasks: TaskListItem[], people: Person[], maxPerPerson?: number): RebalancePlan {
  const byId = new Map(people.map((p) => [p.id, p]));
  const poolIds = new Set<string>();
  for (const t of tasks) if (t.manager && byId.has(t.manager.id)) poolIds.add(t.manager.id);
  for (const p of people) if (p.suggested) poolIds.add(p.id);
  const pool = [...poolIds].map((id) => byId.get(id)!).sort((a, b) => a.name.localeCompare(b.name));

  const limitOf = (p: Person) => maxPerPerson ?? (p.capacity > 0 ? p.capacity : DEFAULT_CAPACITY);
  const load = new Map<string, number>(pool.map((p) => [p.id, 0]));
  const owned = new Map<string, TaskListItem[]>(pool.map((p) => [p.id, []]));
  for (const t of tasks) {
    if (!t.manager || !load.has(t.manager.id)) continue;
    load.set(t.manager.id, load.get(t.manager.id)! + 1);
    owned.get(t.manager.id)!.push(t);
  }
  const before = new Map(load);

  const moves: RebalanceMove[] = [];
  const overloaded = pool
    .filter((p) => load.get(p.id)! > limitOf(p))
    .sort((a, b) => load.get(b.id)! / limitOf(b) - load.get(a.id)! / limitOf(a));

  for (const giver of overloaded) {
    const movable = owned
      .get(giver.id)!
      .filter((t) => t.status === "pendiente")
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          (a.commitmentDate === null ? -1 : 0) - (b.commitmentDate === null ? -1 : 0) ||
          (b.commitmentDate ?? "").localeCompare(a.commitmentDate ?? ""),
      );
    for (const task of movable) {
      if (load.get(giver.id)! <= limitOf(giver)) break;
      const receiver = pool
        .filter((p) => p.id !== giver.id && load.get(p.id)! < limitOf(p))
        .sort((a, b) => load.get(a.id)! / limitOf(a) - load.get(b.id)! / limitOf(b) || a.name.localeCompare(b.name))[0];
      if (!receiver) break;
      load.set(giver.id, load.get(giver.id)! - 1);
      load.set(receiver.id, load.get(receiver.id)! + 1);
      moves.push({
        taskId: task.id,
        title: task.title,
        project: task.project.name,
        from: { id: giver.id, name: giver.name },
        to: { id: receiver.id, name: receiver.name },
      });
    }
  }

  return {
    moves,
    loads: pool.map((p) => ({ id: p.id, name: p.name, limit: limitOf(p), before: before.get(p.id)!, after: load.get(p.id)! })),
    stillOver: pool.filter((p) => load.get(p.id)! > limitOf(p)).map((p) => p.name),
    unassigned: tasks.filter((t) => !t.manager).length,
  };
}

function findWorkflow(workflows: WorkflowDetail[], name: string): WorkflowDetail | null {
  const q = fold(name);
  return workflows.find((w) => fold(w.key) === q || fold(w.name) === q) ?? workflows.find((w) => fold(w.name).includes(q)) ?? null;
}

export const rebalance_workload = defineTool({
  name: "rebalance_workload",
  description:
    "Reparte las tareas abiertas entre el equipo cuando alguien rebasa su capacidad (o el máximo indicado): mueve tareas pendientes de menor prioridad a quien tiene espacio, dentro de un tramo o en todos. Pide confirmación al usuario antes de reasignar.",
  schema: rebalanceSchema,
  capability: isLead,
  available: always,
  confirm: true,
  write: true,
  summarize: toolSummaries.rebalance_workload,
  async run(ctx, input) {
    let workflow: WorkflowDetail | null = null;
    if (input.tramo) {
      workflow = findWorkflow(await fetchWorkflowsAction(), input.tramo);
      if (!workflow) return failure("NOT_FOUND", `No existe el tramo "${input.tramo}".`);
    }

    const [tasks, staff] = await Promise.all([
      fetchTasksAction({ status: OPEN_STATUSES, ...(workflow ? { workflowId: workflow.id } : {}) }),
      fetchAssignableStaffAction(workflow?.id ?? null),
    ]);
    const people = staff
      .filter((s) => s.active)
      .map((s) => ({ id: s.id, name: s.name, capacity: s.capacity, suggested: workflow ? s.suggested : false }));
    const plan = planRebalance(tasks, people, input.maxPerPerson);

    const done: RebalanceMove[] = [];
    for (const move of plan.moves) {
      try {
        await assignTaskAction(move.taskId, move.to.id);
      } catch (err) {
        return { ...actionFailure(err), moved: done, pending: plan.moves.slice(done.length) };
      }
      done.push(move);
      await recordViaAsistente({
        entity: "task",
        entityId: move.taskId,
        actorId: ctx.user.member.id,
        summary: `Responsable de ${quoted(move.title)}: ${move.from.name} → ${move.to.name} (reparto de carga)`,
      });
    }

    return {
      ok: true as const,
      tramo: workflow?.name ?? null,
      moved: done.map((m) => ({ title: m.title, project: m.project, from: m.from.name, to: m.to.name })),
      loads: plan.loads.map(({ name, limit, before, after }) => ({ name, limit, before, after })),
      stillOver: plan.stillOver,
      unassigned: plan.unassigned,
    };
  },
});

export const tools: DefinedTool[] = [
  update_task_status,
  reschedule_task,
  add_task_comment,
  add_checklist_item,
  create_tasks_from_notes,
  rebalance_workload,
] as unknown as DefinedTool[];
