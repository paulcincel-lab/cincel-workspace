/**
 * Reads behind the meeting prep and the agenda mail (Calendario BE §10.2, §11.3). Server-only.
 * Only the organizer and the staff attendees of a confirmed meeting (or the owner of a cached
 * Google event) can read it; everyone else gets null.
 */
import "server-only";

import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  calendarEventAttendees,
  calendarEvents,
  meetingDecisions,
  meetingMinutes,
  projects,
  staff,
  taskStatuses,
  tasks,
  workflowPhases,
  workflows,
} from "@/lib/db/schema";

export type PrepEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  location: string | null;
  meetUrl: string | null;
  projectId: string | null;
};

/** The confirmed event when the viewer organizes it, attends it as staff, or owns its Google cache row. */
export async function getPrepEvent(viewerId: string, eventId: string): Promise<PrepEvent | null> {
  const attends = sql`exists (select 1 from ${calendarEventAttendees} where ${calendarEventAttendees.eventId} = ${calendarEvents.id} and ${calendarEventAttendees.staffId} = ${viewerId})`;
  const [row] = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      timeZone: calendarEvents.timeZone,
      location: calendarEvents.location,
      meetUrl: calendarEvents.meetUrl,
      projectId: calendarEvents.projectId,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.id, eventId),
        isNull(calendarEvents.deletedAt),
        eq(calendarEvents.status, "confirmada"),
        or(
          and(eq(calendarEvents.source, "cincel"), or(eq(calendarEvents.organizerId, viewerId), attends)),
          and(eq(calendarEvents.source, "google"), eq(calendarEvents.ownerStaffId, viewerId)),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type PrepProject = {
  progress: number;
  startDate: string | null;
  endDate: string | null;
  etapaName: string | null;
  phaseName: string | null;
};

/** Progress, plan dates, current etapa and the first open fase of that etapa. */
export async function getPrepProject(projectId: string, includeAdmin: boolean): Promise<PrepProject | null> {
  const [project] = await db
    .select({
      progress: projects.progress,
      startDate: projects.startDate,
      endDate: projects.endDate,
      workflowId: projects.currentWorkflowId,
      etapaName: workflows.name,
    })
    .from(projects)
    .leftJoin(workflows, eq(workflows.id, projects.currentWorkflowId))
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) return null;

  let phaseName: string | null = null;
  if (project.workflowId) {
    const [phase] = await db
      .select({ name: workflowPhases.name })
      .from(tasks)
      .innerJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
      .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
      .where(
        and(
          eq(tasks.projectId, projectId),
          eq(tasks.workflowId, project.workflowId),
          openTask(includeAdmin),
        ),
      )
      .orderBy(asc(workflowPhases.sortOrder))
      .limit(1);
    phaseName = phase?.name ?? null;
  }
  return {
    progress: project.progress,
    startDate: project.startDate,
    endDate: project.endDate,
    etapaName: project.workflowId ? (project.etapaName ?? null) : null,
    phaseName,
  };
}

/** Live, unarchived, open (not completado, no closing custom status) tasks on live projects. Needs the `taskStatuses` left join. */
function openTask(includeAdmin: boolean) {
  return and(
    isNull(tasks.deletedAt),
    eq(tasks.archived, false),
    ne(tasks.status, "completado"),
    or(isNull(tasks.customStatusId), eq(taskStatuses.closes, false)),
    includeAdmin ? undefined : ne(tasks.kind, "admin"),
  );
}

export type PrepScope = { projectId: string } | { staffIds: string[] };

function scopeWhere(scope: PrepScope) {
  return "projectId" in scope ? eq(tasks.projectId, scope.projectId) : inArray(tasks.managerId, scope.staffIds);
}

export type PrepOverdueRow = { taskId: string; title: string; managerName: string | null; date: string };

/** Open tasks of the scope due before `beforeDate`, most late first (max 10), with how many are overdue and open in all. */
export async function listPrepOverdue(
  scope: PrepScope,
  beforeDate: string,
  includeAdmin: boolean,
): Promise<{ rows: PrepOverdueRow[]; overdueCount: number; openCount: number }> {
  if ("staffIds" in scope && scope.staffIds.length === 0) return { rows: [], overdueCount: 0, openCount: 0 };
  const base = and(scopeWhere(scope), isNull(projects.deletedAt), openTask(includeAdmin));

  const rows = await db
    .select({ taskId: tasks.id, title: tasks.title, managerName: staff.name, date: tasks.commitmentDate })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .where(and(base, lt(tasks.commitmentDate, beforeDate)))
    .orderBy(asc(tasks.commitmentDate), asc(tasks.id))
    .limit(10);

  const [counts] = await db
    .select({
      open: sql<number>`count(*)::int`,
      overdue: sql<number>`(count(*) filter (where ${tasks.commitmentDate} < ${beforeDate}))::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(base);

  return {
    rows: rows.flatMap((r) => (r.date ? [{ taskId: r.taskId, title: r.title, managerName: r.managerName, date: r.date }] : [])),
    overdueCount: counts?.overdue ?? 0,
    openCount: counts?.open ?? 0,
  };
}

/** Open tasks of a project with a delivery date in [from, to], soonest first (max 8). */
export async function listPrepDeliveries(
  projectId: string,
  from: string,
  to: string,
  includeAdmin: boolean,
): Promise<{ taskId: string; title: string }[]> {
  return db
    .select({ taskId: tasks.id, title: tasks.title })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNull(projects.deletedAt),
        openTask(includeAdmin),
        gte(tasks.deliveryDate, from),
        lte(tasks.deliveryDate, to),
      ),
    )
    .orderBy(asc(tasks.deliveryDate), asc(tasks.id))
    .limit(8);
}

export type PrepLastMinutes = { startsAt: Date; timeZone: string; decisions: number; openPoints: string[] };

/** The latest earlier confirmed meeting of the project that has minutes. */
export async function getPrepLastMinutes(projectId: string, before: Date, excludeEventId: string): Promise<PrepLastMinutes | null> {
  const [row] = await db
    .select({
      startsAt: calendarEvents.startsAt,
      timeZone: calendarEvents.timeZone,
      openPoints: meetingMinutes.openPoints,
      decisions: sql<number>`(select count(*)::int from ${meetingDecisions} where ${meetingDecisions.minutesId} = ${meetingMinutes.id})`,
    })
    .from(meetingMinutes)
    .innerJoin(calendarEvents, eq(calendarEvents.id, meetingMinutes.eventId))
    .where(
      and(
        eq(calendarEvents.projectId, projectId),
        eq(calendarEvents.status, "confirmada"),
        isNull(calendarEvents.deletedAt),
        lt(calendarEvents.startsAt, before),
        ne(calendarEvents.id, excludeEventId),
      ),
    )
    .orderBy(sql`${calendarEvents.startsAt} desc`)
    .limit(1);
  if (!row) return null;
  const openPoints = Array.isArray(row.openPoints) ? row.openPoints.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
  return { startsAt: row.startsAt, timeZone: row.timeZone, decisions: row.decisions, openPoints };
}

/** Staff ids among the attendees of an event (their shared overdue tasks feed a prep without a project). */
export async function listAttendeeStaffIds(eventId: string): Promise<string[]> {
  const rows = await db
    .select({ staffId: calendarEventAttendees.staffId })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId));
  return rows.flatMap((r) => (r.staffId ? [r.staffId] : []));
}

export type AgendaRecipient = { email: string; name: string };

/** Attendees with an email, in a stable order. */
export async function listAgendaRecipients(eventId: string): Promise<AgendaRecipient[]> {
  const rows = await db
    .select({ email: calendarEventAttendees.email, name: calendarEventAttendees.name })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId))
    .orderBy(asc(calendarEventAttendees.name), asc(calendarEventAttendees.email));
  return rows.filter((r) => r.email.trim() !== "");
}
