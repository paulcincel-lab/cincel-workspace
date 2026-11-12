/**
 * Minutes, decisions and the tasks created from them (Calendario BE §3.4, §8.3). Server-only.
 * Only the organizer and staff attendees can read or write minutes.
 */
import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { emptyMinutes } from "@/lib/calendario/empty";
import { db } from "@/lib/db/client";
import { calendarEventAttendees, calendarEvents, meetingDecisions, meetingMinuteTasks, meetingMinutes, staff, tasks } from "@/lib/db/schema";
import { recordComment } from "@/lib/repositories/history-repository";
import type { MeetingMinutes } from "@/lib/types/calendario";

type Db = Pick<typeof db, "insert" | "select" | "update" | "delete">;

export type MinutesEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  projectId: string | null;
  organizerId: string | null;
  meetUrl: string | null;
  location: string | null;
  status: "confirmada" | "cancelada";
  attendees: { staffId: string | null; contactId: string | null; email: string; name: string }[];
};

/**
 * The event when the viewer may use its minutes: the organizer, a staff attendee,
 * or (for a cached Google event) its owner. `null` otherwise, so callers can answer
 * `NOT_FOUND` without telling whether the event exists.
 */
export async function getEventForMinutes(user: AuthenticatedUser, eventId: string): Promise<MinutesEvent | null> {
  const [event] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), isNull(calendarEvents.deletedAt)));
  if (!event) return null;
  const attendees = await db
    .select({
      staffId: calendarEventAttendees.staffId,
      contactId: calendarEventAttendees.contactId,
      email: calendarEventAttendees.email,
      name: calendarEventAttendees.name,
    })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId));
  const me = user.member.id;
  const allowed =
    event.source === "google"
      ? event.ownerStaffId === me
      : event.organizerId === me || attendees.some((a) => a.staffId === me);
  if (!allowed) return null;
  return {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    projectId: event.projectId,
    organizerId: event.organizerId ?? event.ownerStaffId,
    meetUrl: event.meetUrl,
    location: event.location,
    status: event.status,
    attendees,
  };
}

export async function getMinutes(user: AuthenticatedUser, eventId: string): Promise<MeetingMinutes | null> {
  const event = await getEventForMinutes(user, eventId);
  if (!event) return null;
  const [row] = await db.select().from(meetingMinutes).where(eq(meetingMinutes.eventId, eventId));
  if (!row) return emptyMinutes(eventId);
  const decisions = await db
    .select({ id: meetingDecisions.id, text: meetingDecisions.text })
    .from(meetingDecisions)
    .where(eq(meetingDecisions.minutesId, row.id))
    .orderBy(asc(meetingDecisions.sortOrder), asc(meetingDecisions.createdAt));
  const linked = await db
    .select({ taskId: tasks.id, title: tasks.title })
    .from(meetingMinuteTasks)
    .innerJoin(tasks, eq(tasks.id, meetingMinuteTasks.taskId))
    .where(and(eq(meetingMinuteTasks.minutesId, row.id), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.createdAt));
  return {
    minutesId: row.id,
    eventId,
    notes: row.notes,
    status: row.status,
    openPoints: row.openPoints,
    decisions,
    tasks: linked,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Creates the `meeting_minutes` row for an event when it is missing; returns its id. */
export async function ensureMinutes(user: AuthenticatedUser, eventId: string, tx: Db = db): Promise<{ minutesId: string; projectId: string | null }> {
  const event = await getEventForMinutes(user, eventId);
  if (!event) throw new Error("NOT_FOUND");
  const [row] = await tx
    .insert(meetingMinutes)
    .values({ eventId, projectId: event.projectId, createdById: user.member.id })
    .onConflictDoUpdate({ target: meetingMinutes.eventId, set: { eventId } })
    .returning({ id: meetingMinutes.id, projectId: meetingMinutes.projectId });
  return { minutesId: row.id, projectId: row.projectId };
}

/** Creates the `meeting_minutes` row on first save. */
export async function saveNotes(user: AuthenticatedUser, eventId: string, notes: string): Promise<{ minutesId: string; updatedAt: string }> {
  const event = await getEventForMinutes(user, eventId);
  if (!event) throw new Error("NOT_FOUND");
  const now = new Date();
  const [row] = await db
    .insert(meetingMinutes)
    .values({ eventId, projectId: event.projectId, notes, createdById: user.member.id })
    .onConflictDoUpdate({ target: meetingMinutes.eventId, set: { notes, updatedAt: now } })
    .returning({ id: meetingMinutes.id, updatedAt: meetingMinutes.updatedAt });
  return { minutesId: row.id, updatedAt: row.updatedAt.toISOString() };
}

/**
 * Inserts the decisions and writes each one to the project history as a comment
 * "Decisión: …" (BE §8.3); `history_event_id` keeps the link so undo can retract it.
 */
export async function saveDecisions(
  minutesId: string,
  projectId: string | null,
  texts: string[],
  actorId: string | null = null,
): Promise<{ decisionIds: string[] }> {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return { decisionIds: [] };
  return db.transaction(async (tx) => {
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${meetingDecisions.sortOrder}), -1) + 1` })
      .from(meetingDecisions)
      .where(eq(meetingDecisions.minutesId, minutesId));
    const ids: string[] = [];
    for (const [index, text] of clean.entries()) {
      let historyEventId: string | null = null;
      if (projectId) {
        const event = await recordComment({ entity: "project", entityId: projectId, actorId, comment: `Decisión: ${text}` }, tx);
        historyEventId = event.id;
      }
      const [row] = await tx
        .insert(meetingDecisions)
        .values({ minutesId, projectId, text: text.slice(0, 500), historyEventId, sortOrder: Number(next) + index })
        .returning({ id: meetingDecisions.id });
      ids.push(row.id);
    }
    return { decisionIds: ids };
  });
}

/** Undo of a decision: the row goes away and the project history says so. */
export async function retractDecision(decisionId: string, actorId: string | null): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(meetingDecisions).where(eq(meetingDecisions.id, decisionId)).returning();
    if (!row) return false;
    if (row.projectId) {
      await recordComment({ entity: "project", entityId: row.projectId, actorId, comment: `Decisión retirada: ${row.text}` }, tx);
    }
    return true;
  });
}

export async function linkMinuteTasks(minutesId: string, taskIds: string[]): Promise<void> {
  if (taskIds.length === 0) return;
  await db
    .insert(meetingMinuteTasks)
    .values(taskIds.map((taskId) => ({ minutesId, taskId })))
    .onConflictDoNothing();
}

/** `openPoints` is only written when given; `enviada` stamps `sent_at`. */
export async function setMinutesStatus(minutesId: string, status: "borrador" | "lista" | "enviada", openPoints?: string[]): Promise<void> {
  await db
    .update(meetingMinutes)
    .set({
      status,
      ...(openPoints ? { openPoints } : {}),
      ...(status === "enviada" ? { sentAt: new Date() } : {}),
    })
    .where(eq(meetingMinutes.id, minutesId));
}

/** Stores the open points of an extraction on the draft; they are read by the next meeting's prep once the minutes are `lista`. */
export async function saveOpenPoints(minutesId: string, openPoints: string[]): Promise<void> {
  await db.update(meetingMinutes).set({ openPoints }).where(eq(meetingMinutes.id, minutesId));
}

export type MinutesForMail = {
  minutesId: string;
  decisions: string[];
  tasks: { title: string; owner: string | null; date: string | null }[];
};

/** Decisions and live tasks (with owner and date) of a minutes row, for the "Minuta" mail. */
export async function getMinutesForMail(minutesId: string): Promise<MinutesForMail> {
  const decisions = await db
    .select({ text: meetingDecisions.text })
    .from(meetingDecisions)
    .where(eq(meetingDecisions.minutesId, minutesId))
    .orderBy(asc(meetingDecisions.sortOrder));
  const rows = await db
    .select({ title: tasks.title, owner: staff.name, commitment: tasks.commitmentDate, delivery: tasks.deliveryDate })
    .from(meetingMinuteTasks)
    .innerJoin(tasks, and(eq(tasks.id, meetingMinuteTasks.taskId), isNull(tasks.deletedAt)))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .where(eq(meetingMinuteTasks.minutesId, minutesId))
    .orderBy(asc(tasks.createdAt));
  const list = rows.map((r) => ({ title: r.title, owner: r.owner, date: r.commitment ?? r.delivery ?? null }));
  return { minutesId, decisions: decisions.map((d) => d.text), tasks: list };
}

/** The next confirmed Cincel meeting of the same project after `after`, for the "Próxima junta" line. */
export async function getNextProjectMeeting(projectId: string | null, after: Date): Promise<{ startsAt: Date } | null> {
  if (!projectId) return null;
  const [row] = await db
    .select({ startsAt: calendarEvents.startsAt })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.projectId, projectId),
        eq(calendarEvents.source, "cincel"),
        eq(calendarEvents.status, "confirmada"),
        isNull(calendarEvents.deletedAt),
        sql`${calendarEvents.startsAt} > ${after}`,
      ),
    )
    .orderBy(asc(calendarEvents.startsAt))
    .limit(1);
  return row ?? null;
}

/** History line on the meeting ("Minuta lista", "Ana García envió la minuta a 3 asistentes"). */
export async function recordMeetingHistory(eventId: string, actorId: string | null, comment: string): Promise<void> {
  await recordComment({ entity: "calendar_event", entityId: eventId, actorId, comment });
}

