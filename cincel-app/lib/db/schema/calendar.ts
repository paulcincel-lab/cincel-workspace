import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  attendeeResponse,
  calendarEventSource,
  calendarEventStatus,
  core,
  meetingMinutesStatus,
  soft,
  stamps,
} from "./_schema";
import { contacts } from "./contacts";
import { staff } from "./people";
import { projects } from "./projects";
import { tasks } from "./tasks";
import { workflows } from "./workflows";
import { historyEvents } from "./shared";

/**
 * Meetings created in Cincel and the viewer's own Google events cached in
 * Postgres (Calendario BE §3.2). Cancel is a status, never a delete.
 */
export const calendarEvents = core.table(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `cincel` = created in Cincel; `google` = cached from a person's primary calendar. */
    source: calendarEventSource("source").notNull(),
    /** For `google`: whose calendar it was read from (visibility = owner only). */
    ownerStaffId: uuid("owner_staff_id").references(() => staff.id, { onDelete: "cascade" }),
    organizerId: uuid("organizer_id").references(() => staff.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    timeZone: text("time_zone").notNull().default("America/Mexico_City"),
    location: text("location"),
    meetUrl: text("meet_url"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Tramo colour of the edge; defaults to the project's current tramo. */
    workflowId: uuid("workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    status: calendarEventStatus("status").notNull().default("confirmada"),
    googleCalendarId: text("google_calendar_id"),
    googleEventId: text("google_event_id"),
    googleEtag: text("google_etag"),
    googleHtmlLink: text("google_html_link"),
    /** Last write-through error: NO_GRANT, ACCESS_DENIED, UNAVAILABLE, RATE_LIMITED, REAUTH, GONE, NOT_ORGANIZER. */
    googleSyncError: text("google_sync_error"),
    /** Resync tries after an UNAVAILABLE / RATE_LIMITED write (BE §7.3: max 3); reset on success. */
    googleSyncAttempts: integer("google_sync_attempts").notNull().default(0),
    /** How the attendees were invited at creation (BE §7.6, D13); never changes afterwards. */
    invitesVia: text("invites_via"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => staff.id, { onDelete: "set null" }),
    ...stamps,
    ...soft,
  },
  (t) => [
    check("calendar_events_time_check", sql`${t.endsAt} > ${t.startsAt}`),
    check("calendar_events_invites_via_check", sql`${t.invitesVia} is null or ${t.invitesVia} in ('google', 'cincel')`),
    index("idx_calendar_events_starts").on(t.startsAt),
    index("idx_calendar_events_project_starts").on(t.projectId, t.startsAt),
    index("idx_calendar_events_owner_starts")
      .on(t.ownerStaffId, t.startsAt)
      .where(sql`${t.source} = 'google'`),
    uniqueIndex("calendar_events_google_owner_uq")
      .on(t.ownerStaffId, t.googleEventId)
      .where(sql`${t.source} = 'google'`),
    uniqueIndex("calendar_events_cincel_google_uq")
      .on(t.googleEventId)
      .where(sql`${t.source} = 'cincel' and ${t.googleEventId} is not null`),
  ]
);

export const calendarEventAttendees = core.table(
  "calendar_event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    /** Name snapshot (ADR 0001). */
    name: text("name").notNull(),
    response: attendeeResponse("response").notNull().default("pendiente"),
    isOrganizer: boolean("is_organizer").notNull().default(false),
    optional: boolean("optional").notNull().default(false),
  },
  (t) => [
    uniqueIndex("calendar_event_attendees_email_uq").on(t.eventId, sql`lower(${t.email})`),
    index("idx_calendar_event_attendees_staff").on(t.staffId),
  ]
);

export const meetingMinutes = core.table(
  "meeting_minutes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    notes: text("notes").notNull().default(""),
    status: meetingMinutesStatus("status").notNull().default("borrador"),
    /** Items marked open, read by the next meeting's prep (BE §10.2). */
    openPoints: jsonb("open_points").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => staff.id, { onDelete: "set null" }),
    ...stamps,
  },
  (t) => [
    unique("meeting_minutes_event_uq").on(t.eventId),
    check("meeting_minutes_notes_check", sql`char_length(${t.notes}) <= 20000`),
  ]
);

export const meetingDecisions = core.table(
  "meeting_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minutesId: uuid("minutes_id")
      .notNull()
      .references(() => meetingMinutes.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    historyEventId: uuid("history_event_id").references(() => historyEvents.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("meeting_decisions_text_check", sql`char_length(${t.text}) <= 500`),
    index("idx_meeting_decisions_minutes").on(t.minutesId, t.sortOrder),
  ]
);

export const meetingMinuteTasks = core.table(
  "meeting_minute_tasks",
  {
    minutesId: uuid("minutes_id")
      .notNull()
      .references(() => meetingMinutes.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.minutesId, t.taskId] }), index("idx_meeting_minute_tasks_task").on(t.taskId)]
);
