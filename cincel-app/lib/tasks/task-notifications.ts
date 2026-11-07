import "server-only";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

import { isStaffAdministrator } from "@/lib/auth/access-role";
import { db } from "@/lib/db/client";
import { notify, type NotifyPayload } from "@/lib/notifications/notify";

import { resolveMentions } from "./task-mentions";
import {
  loadNotifiableStaff,
  loadTaskNotifyTarget,
  type NotifiableStaff,
  type TaskNotifyTarget,
} from "./task-notifications-data";

/**
 * Task notification producers (redesign BE §8.3, §9.3): assignment
 * (`asignacion`), comments on a task the recipient manages (`comentario`)
 * and `@Nombre Apellido` mentions (`mencion`). The actions schedule them in
 * `after()`; they never throw: a failure logs `notify.failed` and the user
 * never sees it.
 */

/** One `notify(db, staffIds, payload)` call. */
export type TaskNotifyCall = { staffIds: string[]; payload: NotifyPayload };

const COMMENT_SNIPPET_MAX = 140;

export function taskNotificationUrl(taskId: string): string {
  return `/tareas?tarea=${encodeURIComponent(taskId)}`;
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > COMMENT_SNIPPET_MAX ? `${flat.slice(0, COMMENT_SNIPPET_MAX - 1)}…` : flat;
}

/**
 * Recipients allowed to hear about the task: never the actor, only active
 * staff, and administrators only for admin tasks (BE §9.7).
 */
function eligible(task: TaskNotifyTarget, ids: string[], actorId: string, staffById: Map<string, NotifiableStaff>) {
  return [...new Set(ids)].filter((id) => {
    if (!id || id === actorId) return false;
    const person = staffById.get(id);
    if (!person) return false;
    return task.kind !== "admin" || isStaffAdministrator(person.role, person.email);
  });
}

function basePayload(task: TaskNotifyTarget, actorId: string) {
  return { entity: "task" as const, entityId: task.id, url: taskNotificationUrl(task.id), actorId };
}

/** `asignacion` for the new manager, unless it is the actor. Pure. */
export function planAssignmentNotifications(
  task: TaskNotifyTarget,
  managerId: string | null,
  actorId: string,
  staffList: readonly NotifiableStaff[]
): TaskNotifyCall[] {
  if (!managerId) return [];
  const staffById = new Map(staffList.map((person) => [person.id, person]));
  const staffIds = eligible(task, [managerId], actorId, staffById);
  if (staffIds.length === 0) return [];
  return [
    {
      staffIds,
      payload: {
        kind: "asignacion",
        title: "Te asignaron una tarea",
        body: task.title,
        dedupeKey: `asignacion:${task.id}:${managerId}`,
        ...basePayload(task, actorId),
      },
    },
  ];
}

/**
 * `mencion` once per person mentioned, and `comentario` for the task's
 * manager when not already mentioned; never the actor. Pure.
 */
export function planCommentNotifications(
  task: TaskNotifyTarget,
  eventId: string,
  comment: string,
  actorId: string,
  staffList: readonly NotifiableStaff[]
): TaskNotifyCall[] {
  const staffById = new Map(staffList.map((person) => [person.id, person]));
  const mentioned = eligible(task, resolveMentions(comment, staffList), actorId, staffById);
  const managers = eligible(task, task.managerId ? [task.managerId] : [], actorId, staffById).filter(
    (id) => !mentioned.includes(id)
  );
  const body = `${task.title}: ${snippet(comment)}`;
  const calls: TaskNotifyCall[] = [];
  if (mentioned.length > 0) {
    calls.push({
      staffIds: mentioned,
      payload: {
        kind: "mencion",
        title: "Te mencionaron en una tarea",
        body,
        dedupeKey: `mencion:${eventId}`,
        ...basePayload(task, actorId),
      },
    });
  }
  if (managers.length > 0) {
    calls.push({
      staffIds: managers,
      payload: {
        kind: "comentario",
        title: "Nuevo comentario en tu tarea",
        body,
        dedupeKey: `comentario:${eventId}`,
        ...basePayload(task, actorId),
      },
    });
  }
  return calls;
}

function logNotifyFailure(traceId: string, kind: string, count: number, err: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "notify.failed",
      trace_id: traceId,
      kind,
      count,
      err: err instanceof Error ? err.message : String(err),
    })
  );
}

async function runCalls(calls: TaskNotifyCall[], traceId: string): Promise<void> {
  for (const call of calls) {
    try {
      await notify(db, call.staffIds, call.payload);
    } catch (err) {
      logNotifyFailure(traceId, call.payload.kind, call.staffIds.length, err);
    }
  }
}

/** The request id when the request carries one, else a new uuid. Read before `after()`. */
export async function notifyTraceId(): Promise<string> {
  try {
    const id = (await headers()).get("x-request-id")?.trim();
    if (id) return id;
  } catch {
    // Outside a request scope (scripts, tests): fall through to a new id.
  }
  return randomUUID();
}

/** Runs inside `after()` once a task got a manager. Never throws. */
export async function notifyTaskAssigned(input: {
  task: TaskNotifyTarget;
  managerId: string | null;
  actorId: string;
  traceId: string;
}): Promise<void> {
  const { task, managerId, actorId, traceId } = input;
  if (!managerId || managerId === actorId) return;
  try {
    const staffList = await loadNotifiableStaff([managerId]);
    await runCalls(planAssignmentNotifications(task, managerId, actorId, staffList), traceId);
  } catch (err) {
    logNotifyFailure(traceId, "asignacion", 1, err);
  }
}

/** Runs inside `after()` once a task comment was written. Never throws. */
export async function notifyTaskCommented(input: {
  taskId: string;
  eventId: string;
  comment: string;
  actorId: string;
  traceId: string;
}): Promise<void> {
  const { taskId, eventId, comment, actorId, traceId } = input;
  try {
    const task = await loadTaskNotifyTarget(taskId);
    if (!task) return;
    const staffList = await loadNotifiableStaff();
    await runCalls(planCommentNotifications(task, eventId, comment, actorId, staffList), traceId);
  } catch (err) {
    logNotifyFailure(traceId, "comentario", 0, err);
  }
}
