/**
 * `calendar_events` and attendees: CRUD and visibility (Calendario BE §3.2, §3.3, §8). Server-only.
 *
 * Visibility (§8.2): a cached Google event is for its owner only (not even admins);
 * a Cincel meeting is for its organizer, its staff attendees, the members of the
 * linked project, Administrador and Dirección. Cancel is a status, never a delete.
 * Attendee emails never leave this module in a `CalEventItem` (name only); the
 * organizer-side notice reads go through `getEventForNotice`.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, exists, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveCalendarCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { db } from "@/lib/db/client";
import {
  calendarEventAttendees,
  calendarEvents,
  contacts,
  historyEvents,
  meetingMinutes,
  projectMembers,
  projects,
  staff,
  tasks,
  workflows,
} from "@/lib/db/schema";
import { recordChange, recordComment } from "@/lib/repositories/history-repository";
import { etapaColorSlot } from "@/lib/etapas/etapa-color";
import type {
  AttendeeResponse,
  CalEventAttendee,
  CalEventItem,
  GoogleSyncError,
  InvitesVia,
  MeetingDetail,
  MeetingDraft,
  MeetingPatch,
  MinutesState,
} from "@/lib/types/calendario";

const ORG_TIME_ZONE = "America/Mexico_City";
const MAX_DESCRIPTION = 8000;

type EventRow = typeof calendarEvents.$inferSelect;
type Tx = Pick<typeof db, "insert" | "select" | "update" | "delete">;

// ── Time helpers ────────────────────────────────────────────────────────────

/** Calendar date (`YYYY-MM-DD`) of an instant in the org time zone. */
export function orgDateOf(at: Date, timeZone: string = ORG_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** ISO date-time with the zone's offset ("2026-11-12T10:00:00-06:00"). */
export function toOffsetIso(at: Date, timeZone: string = ORG_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  const offsetMin = Math.round((local - Math.floor(at.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${orgDateOf(at, timeZone)}T${pad(n("hour"))}:${pad(n("minute"))}:${pad(n("second"))}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// ── Permissions ─────────────────────────────────────────────────────────────

const isAdmin = (user: AuthenticatedUser): boolean => user.access === SYSTEM_ADMIN_ROLE;

function canSeeAll(user: AuthenticatedUser): boolean {
  return resolveCalendarCapabilities(user).canViewTeamCalendar;
}

/** Rows the viewer may read (§8.2). */
function visibleTo(user: AuthenticatedUser) {
  const viewerId = user.member.id;
  const own = and(eq(calendarEvents.source, "google"), eq(calendarEvents.ownerStaffId, viewerId));
  const cincel = canSeeAll(user)
    ? eq(calendarEvents.source, "cincel")
    : and(
        eq(calendarEvents.source, "cincel"),
        or(
          eq(calendarEvents.organizerId, viewerId),
          exists(
            db
              .select({ one: sql`1` })
              .from(calendarEventAttendees)
              .where(and(eq(calendarEventAttendees.eventId, calendarEvents.id), eq(calendarEventAttendees.staffId, viewerId)))
          ),
          and(
            isNotNull(calendarEvents.projectId),
            exists(
              db
                .select({ one: sql`1` })
                .from(projectMembers)
                .where(and(eq(projectMembers.projectId, calendarEvents.projectId), eq(projectMembers.staffId, viewerId)))
            )
          )
        )
      );
  return and(isNull(calendarEvents.deletedAt), or(own, cincel));
}

/** Organizer, or Administrador on a Cincel meeting (§13). */
export function canEditEvent(user: AuthenticatedUser, event: Pick<EventRow, "source" | "organizerId">): boolean {
  if (event.source !== "cincel") return false;
  return event.organizerId === user.member.id || isAdmin(user);
}

// ── Mapping ─────────────────────────────────────────────────────────────────

type ItemRow = {
  ev: EventRow;
  projectName: string | null;
  wfId: string | null;
  wfKey: string | null;
  wfName: string | null;
  wfSlot: number | null;
  wfOrder: number | null;
  organizerName: string | null;
  minutesStatus: "borrador" | "lista" | "enviada" | null;
};

const itemSelect = {
  ev: calendarEvents,
  projectName: projects.name,
  wfId: workflows.id,
  wfKey: workflows.key,
  wfName: workflows.name,
  wfSlot: workflows.colorSlot,
  wfOrder: workflows.sortOrder,
  organizerName: staff.name,
  minutesStatus: meetingMinutes.status,
};

/** The joins shared by every read: project, etapa (own or the project's current one), organizer, minutes. */
function selectItemRows(tx: Tx = db) {
  return tx
    .select(itemSelect)
    .from(calendarEvents)
    .leftJoin(projects, eq(projects.id, calendarEvents.projectId))
    .leftJoin(workflows, eq(workflows.id, sql`coalesce(${calendarEvents.workflowId}, ${projects.currentWorkflowId})`))
    .leftJoin(staff, eq(staff.id, calendarEvents.organizerId))
    .leftJoin(meetingMinutes, eq(meetingMinutes.eventId, calendarEvents.id));
}

function slotOf(row: ItemRow): 1 | 2 | 3 | 4 | 5 | null {
  if (!row.wfId) return null;
  return etapaColorSlot({ key: row.wfKey ?? "", sortOrder: row.wfOrder ?? 0, colorSlot: row.wfSlot }) as 1 | 2 | 3 | 4 | 5 | null;
}

function toItem(user: AuthenticatedUser, row: ItemRow, attendees: CalEventAttendee[]): CalEventItem {
  const ev = row.ev;
  const minutes: MinutesState = row.minutesStatus ?? "ninguna";
  return {
    kind: "event",
    id: `e:${ev.id}`,
    eventId: ev.id,
    source: ev.source,
    title: ev.title,
    date: orgDateOf(ev.startsAt, ev.timeZone),
    start: toOffsetIso(ev.startsAt, ev.timeZone),
    end: toOffsetIso(ev.endsAt, ev.timeZone),
    allDay: ev.allDay,
    project: ev.projectId && row.projectName ? { id: ev.projectId, name: row.projectName } : null,
    etapa: row.wfId ? { id: row.wfId, key: row.wfKey, name: row.wfName ?? "", colorSlot: slotOf(row) } : null,
    location: ev.location,
    meetUrl: ev.meetUrl,
    attendees,
    attendeeCount: attendees.length,
    organizer: ev.organizerId && row.organizerName ? { id: ev.organizerId, name: row.organizerName } : null,
    googleHtmlLink: ev.googleHtmlLink,
    syncedAt: ev.syncedAt ? ev.syncedAt.toISOString() : null,
    syncError: ev.googleSyncError,
    minutes,
    canEdit: canEditEvent(user, ev),
    invitesVia: ev.source === "cincel" ? ((ev.invitesVia as InvitesVia | null) ?? null) : null,
  };
}

/** Attendees by event, organizer first, then by name. Names only: emails are not part of an item. */
async function attendeesByEvent(eventIds: string[], tx: Tx = db): Promise<Map<string, CalEventAttendee[]>> {
  const byEvent = new Map<string, CalEventAttendee[]>();
  if (eventIds.length === 0) return byEvent;
  const rows = await tx
    .select({
      eventId: calendarEventAttendees.eventId,
      name: calendarEventAttendees.name,
      staffId: calendarEventAttendees.staffId,
      response: calendarEventAttendees.response,
    })
    .from(calendarEventAttendees)
    .where(inArray(calendarEventAttendees.eventId, eventIds))
    .orderBy(sql`${calendarEventAttendees.isOrganizer} desc`, asc(calendarEventAttendees.name));
  for (const r of rows) {
    const list = byEvent.get(r.eventId) ?? [];
    list.push({ name: r.name, staffId: r.staffId, response: r.response as AttendeeResponse });
    byEvent.set(r.eventId, list);
  }
  return byEvent;
}

async function itemsOf(user: AuthenticatedUser, rows: ItemRow[], tx: Tx = db): Promise<CalEventItem[]> {
  const attendees = await attendeesByEvent(
    rows.map((r) => r.ev.id),
    tx
  );
  return rows.map((r) => toItem(user, r, attendees.get(r.ev.id) ?? []));
}

// ── Reads ───────────────────────────────────────────────────────────────────

/** One event the viewer may read; `null` when it is missing or not visible. */
export async function getEventItem(user: AuthenticatedUser, eventId: string): Promise<CalEventItem | null> {
  const rows = await selectItemRows().where(and(eq(calendarEvents.id, eventId), visibleTo(user))).limit(1);
  if (rows.length === 0) return null;
  return (await itemsOf(user, rows))[0] ?? null;
}

/** Events starting in `[from, to]` (org-time dates, inclusive) the viewer may read, by start. */
export async function listEventsInRange(
  user: AuthenticatedUser,
  range: { from: string; to: string },
  opts: { includeCancelled?: boolean; projectIds?: string[]; mine?: boolean } = {}
): Promise<CalEventItem[]> {
  const viewerId = user.member.id;
  const fromAt = sql`(${range.from}::date)::timestamp at time zone ${ORG_TIME_ZONE}`;
  const toAt = sql`((${range.to}::date + 1)::timestamp at time zone ${ORG_TIME_ZONE})`;
  const conditions = [visibleTo(user), gte(calendarEvents.startsAt, fromAt), lt(calendarEvents.startsAt, toAt)];
  if (!opts.includeCancelled) conditions.push(eq(calendarEvents.status, "confirmada"));
  if (opts.projectIds && opts.projectIds.length > 0) conditions.push(inArray(calendarEvents.projectId, opts.projectIds));
  if (opts.mine) {
    conditions.push(
      or(
        eq(calendarEvents.ownerStaffId, viewerId),
        eq(calendarEvents.organizerId, viewerId),
        exists(
          db
            .select({ one: sql`1` })
            .from(calendarEventAttendees)
            .where(and(eq(calendarEventAttendees.eventId, calendarEvents.id), eq(calendarEventAttendees.staffId, viewerId)))
        )
      )!
    );
  }
  const rows = await selectItemRows()
    .where(and(...conditions))
    .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.id));
  return itemsOf(user, rows);
}

const FIELD_LABELS: Record<string, string> = {
  title: "el título",
  start: "el inicio",
  end: "el fin",
  location: "el lugar",
  attendees: "los asistentes",
};

/** What the Historial of a meeting shows: creation, edits and cancel, newest first. */
async function meetingHistory(eventId: string): Promise<MeetingDetail["history"]> {
  const rows = await db
    .select({
      id: historyEvents.id,
      kind: historyEvents.kind,
      field: historyEvents.field,
      before: historyEvents.beforeValue,
      after: historyEvents.afterValue,
      comment: historyEvents.comment,
      at: historyEvents.eventAt,
      actor: staff.name,
    })
    .from(historyEvents)
    .leftJoin(staff, eq(staff.id, historyEvents.actorId))
    .where(and(eq(historyEvents.entity, "calendar_event"), eq(historyEvents.entityId, eventId)))
    .orderBy(sql`${historyEvents.eventAt} desc`, sql`${historyEvents.id} desc`)
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    text:
      r.kind === "comentario"
        ? (r.comment ?? "")
        : `${r.actor ?? "Alguien"} cambió ${FIELD_LABELS[r.field ?? ""] ?? r.field ?? "un dato"}${
            r.before || r.after ? `: ${r.before || "vacío"} → ${r.after || "vacío"}` : ""
          }.`,
  }));
}

/** Fields, Relacionado (open project tasks due before the start) and Historial; `null` when not visible. */
export async function getMeetingDetail(user: AuthenticatedUser, eventId: string): Promise<MeetingDetail | null> {
  const item = await getEventItem(user, eventId);
  if (!item) return null;

  let relatedOverdue: MeetingDetail["relatedOverdue"] = [];
  if (item.project && item.source === "cincel") {
    const due = sql<string>`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
    const rows = await db
      .select({ taskId: tasks.id, title: tasks.title, date: due, managerName: staff.name })
      .from(tasks)
      .leftJoin(staff, eq(staff.id, tasks.managerId))
      .where(
        and(
          eq(tasks.projectId, item.project.id),
          isNull(tasks.deletedAt),
          eq(tasks.archived, false),
          isNull(tasks.closedAt),
          isAdmin(user) ? undefined : ne(tasks.kind, "admin"),
          sql`${due} is not null and ${due} < ${item.date}::date`
        )
      )
      .orderBy(asc(due), asc(tasks.title))
      .limit(50);
    const startDay = Date.parse(`${item.date}T00:00:00Z`);
    relatedOverdue = rows.map((r) => ({
      taskId: r.taskId,
      title: r.title,
      date: String(r.date),
      daysLate: Math.max(1, Math.round((startDay - Date.parse(`${String(r.date)}T00:00:00Z`)) / 86_400_000)),
      managerName: r.managerName,
    }));
  }

  return { item, relatedOverdue, history: await meetingHistory(eventId) };
}

// ── Notice data (service use; carries emails) ───────────────────────────────

export type EventNoticeData = {
  id: string;
  source: "cincel" | "google";
  status: "confirmada" | "cancelada";
  title: string;
  startsAt: Date;
  endsAt: Date;
  timeZone: string;
  location: string | null;
  description: string | null;
  meetUrl: string | null;
  projectId: string | null;
  organizerId: string | null;
  invitesVia: InvitesVia | null;
  googleEventId: string | null;
  googleEtag: string | null;
  googleSyncError: GoogleSyncError | null;
  attendees: { staffId: string | null; contactId: string | null; email: string; name: string; isOrganizer: boolean }[];
};

/** The row with attendee emails, for notices and Google writes. Not a read path for the UI. */
export async function getEventForNotice(eventId: string, tx: Tx = db): Promise<EventNoticeData | null> {
  const [ev] = await tx
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), isNull(calendarEvents.deletedAt)))
    .limit(1);
  if (!ev) return null;
  const attendees = await tx
    .select({
      staffId: calendarEventAttendees.staffId,
      contactId: calendarEventAttendees.contactId,
      email: calendarEventAttendees.email,
      name: calendarEventAttendees.name,
      isOrganizer: calendarEventAttendees.isOrganizer,
    })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId))
    .orderBy(sql`${calendarEventAttendees.isOrganizer} desc`, asc(calendarEventAttendees.name));
  return {
    id: ev.id,
    source: ev.source,
    status: ev.status,
    title: ev.title,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    timeZone: ev.timeZone,
    location: ev.location,
    description: ev.description,
    meetUrl: ev.meetUrl,
    projectId: ev.projectId,
    organizerId: ev.organizerId,
    invitesVia: (ev.invitesVia as InvitesVia | null) ?? null,
    googleEventId: ev.googleEventId,
    googleEtag: ev.googleEtag,
    googleSyncError: (ev.googleSyncError as GoogleSyncError | null) ?? null,
    attendees,
  };
}

// ── Attendees ───────────────────────────────────────────────────────────────

type ResolvedAttendee = {
  staffId: string | null;
  contactId: string | null;
  email: string;
  name: string;
  isOrganizer: boolean;
  optional: boolean;
};

/**
 * Staff by email, contacts and free emails; the name is a snapshot. A staff id
 * wins over an email match; duplicates by email (case-insensitive) collapse; the
 * organizer is always the first row.
 */
async function resolveAttendees(
  tx: Tx,
  organizer: { staffId: string; email: string; name: string },
  input: MeetingDraft["attendees"]
): Promise<ResolvedAttendee[]> {
  const emails = [...new Set(input.map((a) => a.email.trim().toLowerCase()))];
  const staffIds = [...new Set(input.map((a) => a.staffId).filter((v): v is string => Boolean(v)))];
  const staffRows =
    emails.length || staffIds.length
      ? await tx
          .select({ id: staff.id, email: staff.email })
          .from(staff)
          .where(
            and(
              isNull(staff.deletedAt),
              or(
                emails.length ? inArray(sql`lower(${staff.email})`, emails) : undefined,
                staffIds.length ? inArray(staff.id, staffIds) : undefined
              )
            )
          )
      : [];
  const staffByEmail = new Map(staffRows.filter((r) => r.email).map((r) => [r.email!.toLowerCase(), r.id]));
  const staffById = new Set(staffRows.map((r) => r.id));

  const organizerRow: ResolvedAttendee = {
    staffId: organizer.staffId,
    contactId: null,
    email: organizer.email,
    name: organizer.name,
    isOrganizer: true,
    optional: false,
  };
  const map = new Map<string, ResolvedAttendee>([[organizer.email.toLowerCase(), organizerRow]]);
  for (const a of input) {
    const key = a.email.trim().toLowerCase();
    const resolvedStaff = a.staffId && staffById.has(a.staffId) ? a.staffId : (staffByEmail.get(key) ?? null);
    const existing = map.get(key);
    if (existing) {
      existing.staffId ??= resolvedStaff;
      existing.contactId ??= a.contactId ?? null;
      continue;
    }
    map.set(key, {
      staffId: resolvedStaff,
      contactId: a.contactId ?? null,
      email: a.email.trim(),
      name: a.name.trim(),
      isOrganizer: false,
      optional: false,
    });
  }
  // The organizer is one row even when they were also added under another email.
  return [...map.values()].filter((r) => r === organizerRow || r.staffId !== organizer.staffId);
}

/** A contact id must exist and be live; a stale id is dropped so it never blocks the save. */
async function liveContactIds(tx: Tx, ids: (string | null)[]): Promise<Set<string>> {
  const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (wanted.length === 0) return new Set();
  const rows = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(inArray(contacts.id, wanted), isNull(contacts.deletedAt)));
  return new Set(rows.map((r) => r.id));
}

/** Upserts by (event, lower(email)): a kept attendee keeps their response. */
async function writeAttendees(tx: Tx, eventId: string, rows: ResolvedAttendee[]): Promise<void> {
  if (rows.length === 0) return;
  const live = await liveContactIds(
    tx,
    rows.map((r) => r.contactId)
  );
  const existing = await tx
    .select({ id: calendarEventAttendees.id, email: calendarEventAttendees.email })
    .from(calendarEventAttendees)
    .where(eq(calendarEventAttendees.eventId, eventId));
  const byEmail = new Map(existing.map((e) => [e.email.toLowerCase(), e.id]));
  for (const r of rows) {
    const values = {
      staffId: r.staffId,
      contactId: r.contactId && live.has(r.contactId) ? r.contactId : null,
      name: r.name,
      isOrganizer: r.isOrganizer,
      optional: r.optional,
    };
    const id = byEmail.get(r.email.toLowerCase());
    if (id) {
      await tx.update(calendarEventAttendees).set(values).where(eq(calendarEventAttendees.id, id));
    } else {
      await tx.insert(calendarEventAttendees).values({ eventId, email: r.email, ...values });
    }
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Linking a project requires seeing it; returns the project's current etapa for the edge colour. */
async function assertProjectLinkable(tx: Tx, user: AuthenticatedUser, projectId: string): Promise<{ currentWorkflowId: string | null }> {
  if (!resolveProjectsCapabilities(user).canViewProjects) throw new Error("FORBIDDEN");
  const [project] = await tx
    .select({ id: projects.id, currentWorkflowId: projects.currentWorkflowId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!project) throw new Error("INVALID: projectId");
  return { currentWorkflowId: project.currentWorkflowId };
}

function parseWindow(start: string, end: string): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) throw new Error("INVALID: end");
  return { startsAt, endsAt };
}

/**
 * Creates a Cincel meeting row with its attendees; `invitesVia` is set once and never changes.
 * The organizer is the viewer and is always an attendee. `opts.id` lets the caller use the id
 * as the Google `requestId` before the row exists. Writes the `calendar_event` history line
 * and a project comment when linked.
 */
export async function createEvent(
  user: AuthenticatedUser,
  draft: MeetingDraft,
  opts: { invitesVia: "google" | "cincel"; googleSyncError?: string | null; id?: string }
): Promise<CalEventItem> {
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
  const { startsAt, endsAt } = parseWindow(draft.start, draft.end);
  const title = draft.title.trim();
  if (!title || title.length > 200) throw new Error("INVALID: title");
  if ((draft.description?.length ?? 0) > MAX_DESCRIPTION) throw new Error("INVALID: description");
  if (draft.attendees.length > 50) throw new Error("INVALID: attendees");

  const id = opts.id ?? randomUUID();
  const organizerId = user.member.id;

  await db.transaction(async (tx) => {
    const project = draft.projectId ? await assertProjectLinkable(tx, user, draft.projectId) : null;
    await tx.insert(calendarEvents).values({
      id,
      source: "cincel",
      organizerId,
      title,
      description: draft.description?.trim() || null,
      startsAt,
      endsAt,
      timeZone: ORG_TIME_ZONE,
      location: draft.location?.trim() || null,
      projectId: draft.projectId,
      workflowId: project?.currentWorkflowId ?? null,
      invitesVia: opts.invitesVia,
      googleSyncError: opts.googleSyncError ?? null,
      createdById: organizerId,
    });
    const attendees = await resolveAttendees(tx, { staffId: organizerId, email: user.email, name: user.member.name }, draft.attendees);
    await writeAttendees(tx, id, attendees);
    const line = `${user.member.name} creó la reunión «${title}».`;
    await recordComment({ entity: "calendar_event", entityId: id, actorId: organizerId, comment: line }, tx);
    if (draft.projectId) await recordComment({ entity: "project", entityId: draft.projectId, actorId: organizerId, comment: line }, tx);
  });

  const item = await getEventItem(user, id);
  if (!item) throw new Error("NOT_FOUND");
  return item;
}

/**
 * Edits a meeting (organizer, or Administrador on a Cincel meeting): updates the changed fields,
 * replaces attendees when given, and writes one `calendar_event` history line per changed field.
 */
export async function updateEvent(user: AuthenticatedUser, eventId: string, patch: MeetingPatch): Promise<CalEventItem> {
  const before = await getEventForNotice(eventId);
  if (!before || before.source !== "cincel") throw new Error("NOT_FOUND");
  if (!(await getEventItem(user, eventId))) throw new Error("NOT_FOUND");
  if (!canEditEvent(user, { source: before.source, organizerId: before.organizerId })) throw new Error("FORBIDDEN");
  if (before.status === "cancelada") throw new Error("INVALID: status");

  const next = {
    title: patch.title !== undefined ? patch.title.trim() : before.title,
    startsAt: patch.start !== undefined ? new Date(patch.start) : before.startsAt,
    endsAt: patch.end !== undefined ? new Date(patch.end) : before.endsAt,
    location: patch.location !== undefined ? patch.location?.trim() || null : before.location,
  };
  if (!next.title || next.title.length > 200) throw new Error("INVALID: title");
  parseWindow(next.startsAt.toISOString(), next.endsAt.toISOString());
  if (patch.attendees && patch.attendees.length > 50) throw new Error("INVALID: attendees");

  await db.transaction(async (tx) => {
    const set: Partial<typeof calendarEvents.$inferInsert> = {};
    const actorId = user.member.id;
    const changes: { field: string; before: string | null; after: string | null }[] = [];
    if (next.title !== before.title) {
      set.title = next.title;
      changes.push({ field: "title", before: before.title, after: next.title });
    }
    if (next.startsAt.getTime() !== before.startsAt.getTime()) {
      set.startsAt = next.startsAt;
      changes.push({ field: "start", before: before.startsAt.toISOString(), after: next.startsAt.toISOString() });
    }
    if (next.endsAt.getTime() !== before.endsAt.getTime()) {
      set.endsAt = next.endsAt;
      changes.push({ field: "end", before: before.endsAt.toISOString(), after: next.endsAt.toISOString() });
    }
    if (next.location !== before.location) {
      set.location = next.location;
      changes.push({ field: "location", before: before.location, after: next.location });
    }

    if (patch.attendees) {
      const organizerRow = before.attendees.find((a) => a.isOrganizer);
      const organizer = {
        staffId: before.organizerId ?? user.member.id,
        email: organizerRow?.email ?? user.email,
        name: organizerRow?.name ?? user.member.name,
      };
      const resolved = await resolveAttendees(tx, organizer, patch.attendees);
      const keep = new Set(resolved.map((r) => r.email.toLowerCase()));
      const previous = new Set(before.attendees.map((a) => a.email.toLowerCase()));
      const removed = before.attendees.filter((a) => !a.isOrganizer && !keep.has(a.email.toLowerCase()));
      const added = resolved.filter((r) => !previous.has(r.email.toLowerCase()));
      if (removed.length) {
        await tx.delete(calendarEventAttendees).where(
          and(
            eq(calendarEventAttendees.eventId, eventId),
            inArray(
              sql`lower(${calendarEventAttendees.email})`,
              removed.map((r) => r.email.toLowerCase())
            )
          )
        );
      }
      await writeAttendees(tx, eventId, resolved);
      if (removed.length || added.length) {
        changes.push({
          field: "attendees",
          before: removed.map((r) => r.name).join(", ") || null,
          after: added.map((r) => r.name).join(", ") || null,
        });
      }
    }

    if (Object.keys(set).length > 0) await tx.update(calendarEvents).set({ ...set, updatedAt: new Date() }).where(eq(calendarEvents.id, eventId));
    for (const c of changes) await recordChange({ entity: "calendar_event", entityId: eventId, actorId, ...c }, tx);
    if (changes.length && before.projectId) {
      await recordComment(
        { entity: "project", entityId: before.projectId, actorId, comment: `${user.member.name} editó la reunión «${next.title}».` },
        tx
      );
    }
  });

  const item = await getEventItem(user, eventId);
  if (!item) throw new Error("NOT_FOUND");
  return item;
}

/** Cancel is a status, never a delete (history rule). Idempotent: cancelling twice writes one line. */
export async function cancelEvent(user: AuthenticatedUser, eventId: string): Promise<{ eventId: string }> {
  const before = await getEventForNotice(eventId);
  if (!before || before.source !== "cincel") throw new Error("NOT_FOUND");
  if (!(await getEventItem(user, eventId))) throw new Error("NOT_FOUND");
  if (!canEditEvent(user, { source: before.source, organizerId: before.organizerId })) throw new Error("FORBIDDEN");
  if (before.status === "cancelada") return { eventId };

  await db.transaction(async (tx) => {
    await tx.update(calendarEvents).set({ status: "cancelada", updatedAt: new Date() }).where(eq(calendarEvents.id, eventId));
    const line = `${user.member.name} canceló la reunión «${before.title}».`;
    await recordComment({ entity: "calendar_event", entityId: eventId, actorId: user.member.id, comment: line }, tx);
    if (before.projectId) await recordComment({ entity: "project", entityId: before.projectId, actorId: user.member.id, comment: line }, tx);
  });
  return { eventId };
}

/** Stores the outcome of a Google write-through on the event row (system write, no viewer). */
export async function setGoogleSyncState(
  eventId: string,
  state: { googleEventId?: string | null; etag?: string | null; htmlLink?: string | null; meetUrl?: string | null; error: string | null }
): Promise<void> {
  const set: Partial<typeof calendarEvents.$inferInsert> = { googleSyncError: state.error, updatedAt: new Date() };
  if (state.googleEventId !== undefined) {
    set.googleEventId = state.googleEventId;
    set.googleCalendarId = state.googleEventId ? "primary" : null;
    if (state.googleEventId) set.syncedAt = new Date();
  }
  if (state.etag !== undefined) set.googleEtag = state.etag;
  if (state.htmlLink !== undefined) set.googleHtmlLink = state.htmlLink;
  if (state.meetUrl !== undefined) set.meetUrl = state.meetUrl;
  await db.update(calendarEvents).set(set).where(eq(calendarEvents.id, eventId));
}

/** The one allowed change of `invites_via`: a meeting that could not reach Google at create takes the failure path (D13). */
export async function setInvitesVia(eventId: string, via: InvitesVia): Promise<void> {
  await db.update(calendarEvents).set({ invitesVia: via, updatedAt: new Date() }).where(eq(calendarEvents.id, eventId));
}
