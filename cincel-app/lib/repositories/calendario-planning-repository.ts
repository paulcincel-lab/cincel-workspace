/**
 * Reads the planning tools need (Calendario BE §10.3, §11.2): the open tasks
 * of one person and day with their dependencies, and the meetings a person
 * attends. Server-only. Viewer scope is applied here: admin tasks are never
 * returned to a viewer who cannot see admin data.
 */
import "server-only";

import { and, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  calendarEventAttendees,
  calendarEvents,
  projects,
  staff,
  taskDependencies,
  taskStatuses,
  tasks,
  workflowTaskTemplates,
} from "@/lib/db/schema";
import type { TaskPriority, ViewerScope } from "@/lib/types/core";

export type DayTaskRow = {
  id: string;
  title: string;
  projectName: string | null;
  priority: TaskPriority;
  blocked: boolean;
  commitmentDate: string | null;
  deliveryDate: string | null;
  estimatedHours: number | null;
  templateHours: number | null;
  dependsOn: string[];
  dependents: { taskId: string; date: string }[];
};

/** Open tasks managed by `staffId` whose due date (commitment, else delivery) is `date`. */
export async function openTasksDueOn(staffId: string, date: string, viewer: ViewerScope): Promise<DayTaskRow[]> {
  const due = sql<string>`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectName: projects.name,
      priority: tasks.priority,
      status: tasks.status,
      commitmentDate: tasks.commitmentDate,
      deliveryDate: tasks.deliveryDate,
      estimatedHours: tasks.estimatedHours,
      templateHours: workflowTaskTemplates.defaultEstimatedHours,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .leftJoin(workflowTaskTemplates, eq(workflowTaskTemplates.id, tasks.templateId))
    .where(
      and(
        eq(tasks.managerId, staffId),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.status, "completado"),
        sql`coalesce(${taskStatuses.closes}, false) = false`,
        sql`${due} = ${date}`,
        viewer.isAdmin ? undefined : ne(tasks.kind, "admin"),
      ),
    )
    .orderBy(tasks.id);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const dependsRows = await db
    .select({ taskId: taskDependencies.taskId, dependsOn: taskDependencies.dependsOnTaskId })
    .from(taskDependencies)
    .where(inArray(taskDependencies.taskId, ids));
  const dependentRows = await db
    .select({
      taskId: taskDependencies.dependsOnTaskId,
      dependent: tasks.id,
      commitmentDate: tasks.commitmentDate,
      deliveryDate: tasks.deliveryDate,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.taskId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(
      and(
        inArray(taskDependencies.dependsOnTaskId, ids),
        isNull(tasks.deletedAt),
        ne(tasks.status, "completado"),
        sql`coalesce(${taskStatuses.closes}, false) = false`,
      ),
    );

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    projectName: r.projectName ?? null,
    priority: r.priority as TaskPriority,
    blocked: r.status === "bloqueado",
    commitmentDate: r.commitmentDate ?? null,
    deliveryDate: r.deliveryDate ?? null,
    estimatedHours: r.estimatedHours ?? null,
    templateHours: r.templateHours ?? null,
    dependsOn: dependsRows.filter((d) => d.taskId === r.id).map((d) => d.dependsOn),
    dependents: dependentRows
      .filter((d) => d.taskId === r.id)
      .flatMap((d) => {
        const date = d.commitmentDate ?? d.deliveryDate;
        return date ? [{ taskId: d.dependent, date }] : [];
      }),
  }));
}

export type OverlapEventRow = {
  id: string;
  source: "cincel" | "google";
  title: string;
  startsAt: Date;
  endsAt: Date;
  organizerId: string | null;
  createdAt: Date;
  status: "confirmada" | "cancelada";
  attendees: { staffId: string | null; email: string; name: string }[];
};

/** The meetings of `ids` with their attendees; cancelled and deleted ones are left out. */
export async function eventsWithAttendees(ids: string[]): Promise<OverlapEventRow[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(and(inArray(calendarEvents.id, ids), isNull(calendarEvents.deletedAt), eq(calendarEvents.status, "confirmada")));
  if (rows.length === 0) return [];
  const attendees = await db
    .select({
      eventId: calendarEventAttendees.eventId,
      staffId: calendarEventAttendees.staffId,
      email: calendarEventAttendees.email,
      name: calendarEventAttendees.name,
    })
    .from(calendarEventAttendees)
    .where(
      inArray(
        calendarEventAttendees.eventId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(calendarEventAttendees.email);
  return rows.map((r) => ({
    id: r.id,
    source: r.source as "cincel" | "google",
    title: r.title,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    organizerId: r.organizerId ?? null,
    createdAt: r.createdAt,
    status: r.status as "confirmada" | "cancelada",
    attendees: attendees
      .filter((a) => a.eventId === r.id)
      .map((a) => ({ staffId: a.staffId ?? null, email: a.email, name: a.name })),
  }));
}

/**
 * Confirmed Cincel meetings between `from` and `to` that any of `staffIds`
 * organizes or attends, as busy intervals (the meeting `excludeId` is left out).
 */
export async function staffBusyIntervals(
  staffIds: string[],
  from: Date,
  to: Date,
  excludeId: string,
): Promise<{ start: string; end: string }[]> {
  if (staffIds.length === 0) return [];
  const attending = db
    .select({ eventId: calendarEventAttendees.eventId })
    .from(calendarEventAttendees)
    .where(inArray(calendarEventAttendees.staffId, staffIds));
  const rows = await db
    .select({ start: calendarEvents.startsAt, end: calendarEvents.endsAt })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.source, "cincel"),
        eq(calendarEvents.status, "confirmada"),
        isNull(calendarEvents.deletedAt),
        ne(calendarEvents.id, excludeId),
        lt(calendarEvents.startsAt, to),
        gt(calendarEvents.endsAt, from),
        eq(calendarEvents.allDay, false),
        or(inArray(calendarEvents.organizerId, staffIds), inArray(calendarEvents.id, attending)),
      ),
    )
    .orderBy(calendarEvents.startsAt, calendarEvents.id);
  return rows.map((r) => ({ start: r.start.toISOString(), end: r.end.toISOString() }));
}

/** A person's display name, or null when they no longer exist. */
export async function staffDisplayName(staffId: string): Promise<string | null> {
  const [row] = await db.select({ name: staff.name, lastName: staff.lastName }).from(staff).where(eq(staff.id, staffId)).limit(1);
  if (!row) return null;
  return [row.name, row.lastName].filter(Boolean).join(" ");
}
