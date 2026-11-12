/**
 * Primary-calendar read cache, write-through and free/busy (Calendario BE §7).
 * Server-only. Range loads read only the cache; Google is called from here
 * (refresh, meeting write-through, free/busy), always with the viewer's or the
 * organizer's own token.
 */
import "server-only";

import { and, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import {
  type GoogleCalendarEvent,
  type GoogleEventWrite,
  CalendarScopeMissingError,
  calendarCall,
  deletePrimaryEvent,
  getPrimaryEvent,
  insertPrimaryEvent,
  patchPrimaryEvent,
} from "@/lib/assistant/agenda/google-calendar";
import {
  addDaysToDate,
  type BusyInterval,
  eachDate,
  localDateOf,
  minutesOf,
  weekdayOf,
  zonedTimeToUtc,
} from "@/lib/assistant/agenda/free-slots";
import { db } from "@/lib/db/client";
import { calendarEventAttendees, calendarEvents, googleOauthAccounts, staff } from "@/lib/db/schema";
import { GoogleCalendarError, isGone } from "@/lib/google/calendar-api";
import { getStaffAccessToken } from "@/lib/google/staff-token";
import * as calendarEventsRepository from "@/lib/repositories/calendar-events-repository";
import * as syncRepository from "@/lib/repositories/google-calendar-sync-repository";
import { GENERAL_SETTINGS_DEFAULTS } from "@/lib/settings/general-settings";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";
import type { MeetingPatch } from "@/lib/types/calendario";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

const PRIMARY = "primary";
const DEFAULT_TZ = GENERAL_SETTINGS_DEFAULTS.regional.timeZone;
const DAY_MS = 86_400_000;

/** Window of the cache: today − 35 days to today + 120 days. */
export const PRIMARY_WINDOW_PAST_DAYS = 35;
export const PRIMARY_WINDOW_FUTURE_DAYS = 120;
/** A refresh within this time of the last good one is skipped (unless `force`). */
export const PRIMARY_FRESH_MS = 5 * 60_000;
/** When the cached window ends sooner than this many days ahead, the next refresh re-reads it. */
const WINDOW_RENEW_DAYS = 90;
const PAGE_SIZE = "250";
const UPSERT_BATCH = 100;

export const FREE_BUSY_MAX_EMAILS = 20;
export const FREE_BUSY_MAX_DAYS = 31;

/** Resync tries of a meeting write (BE §7.3). */
export const MEETING_SYNC_MAX_TRIES = 3;

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Errors ──────────────────────────────────────────────────────────────────

/** What `calendar_events.google_sync_error` / `google_calendar_syncs.primary_error` can hold, plus CONFLICT. */
export type GoogleFailure =
  | "NO_GRANT"
  | "ACCESS_DENIED"
  | "REAUTH"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "CONFLICT"
  | "GONE"
  | "NOT_ORGANIZER";

/** Maps a thrown Google or network error to a failure code (BE §7.5). */
export function classifyGoogleError(error: unknown): GoogleFailure {
  if (error instanceof CalendarScopeMissingError) return "NO_GRANT";
  if (error instanceof GoogleCalendarError) {
    const { status, message } = error;
    if (status === 401) return "REAUTH";
    if (status === 412) return "CONFLICT";
    if (status === 404 || status === 410) return "GONE";
    if (status === 429) return "RATE_LIMITED";
    if (status === 403) {
      if (/rate|quota/i.test(message)) return "RATE_LIMITED";
      return /insufficient|scope/i.test(message) ? "REAUTH" : "NOT_ORGANIZER";
    }
    return "UNAVAILABLE";
  }
  return "UNAVAILABLE";
}

/** The action error code (`lib/errors.ts`) a failure surfaces as. */
export function actionCodeOf(failure: GoogleFailure): string {
  switch (failure) {
    case "REAUTH":
    case "NO_GRANT":
    case "ACCESS_DENIED":
      return "GOOGLE_REAUTH";
    case "CONFLICT":
      return "CONFLICT";
    case "NOT_ORGANIZER":
      return "NOT_ORGANIZER";
    default:
      return "GOOGLE_UNAVAILABLE";
  }
}

/** Rate limit and 5xx get one more try after a short backoff (BE §7.5: 2 tries). */
async function withRetry<T>(run: () => Promise<T>, sleep: Sleep): Promise<T> {
  const tries = 2;
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const failure = classifyGoogleError(error);
      if (attempt >= tries || (failure !== "UNAVAILABLE" && failure !== "RATE_LIMITED")) throw error;
      await sleep(500 * attempt);
    }
  }
}

// ── Access ──────────────────────────────────────────────────────────────────

type Access =
  | { status: "ok"; token: string }
  | { status: "not_connected" }
  | { status: "no_grant" }
  | { status: "reauth" };

/** The token of the `calendar_events` grant, or why there is none. */
async function accessFor(staffId: string): Promise<Access> {
  const result = await getStaffAccessToken(staffId, "calendar_events");
  if (result.status === "ok") return { status: "ok", token: result.accessToken };
  const [row] = await db
    .select({ accessToken: googleOauthAccounts.accessToken, scope: googleOauthAccounts.scope })
    .from(googleOauthAccounts)
    .where(eq(googleOauthAccounts.staffId, staffId))
    .limit(1);
  if (!row) return { status: "not_connected" };
  // Tokens and scope are cleared on `invalid_grant` (staff-token.ts): the grant is gone.
  if (row.accessToken === "" && !row.scope) return { status: "reauth" };
  return { status: "no_grant" };
}

// ── Mapping Google events to cache rows ─────────────────────────────────────

export type MappedAttendee = {
  email: string;
  name: string;
  response: "pendiente" | "acepta" | "rechaza" | "tentativo";
  isOrganizer: boolean;
  optional: boolean;
};

export type MappedEvent = {
  googleEventId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timeZone: string;
  location: string | null;
  meetUrl: string | null;
  htmlLink: string | null;
  etag: string | null;
  organizerEmail: string | null;
  attendees: MappedAttendee[];
};

const RESPONSES: Record<string, MappedAttendee["response"]> = {
  accepted: "acepta",
  declined: "rechaza",
  tentative: "tentativo",
};

export function meetUrlOf(event: Pick<GoogleCalendarEvent, "hangoutLink" | "conferenceData">): string | null {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video" && p.uri);
  return video?.uri ?? null;
}

/** A Google event as a cache row, or null when it has no usable start. */
export function mapGoogleEvent(event: GoogleCalendarEvent): MappedEvent | null {
  const start = event.start;
  if (!start || (!start.dateTime && !start.date)) return null;
  const timeZone = start.timeZone ?? event.end?.timeZone ?? DEFAULT_TZ;
  const allDay = !start.dateTime;
  let startsAt: Date;
  let endsAt: Date;
  if (allDay) {
    const first = start.date as string;
    startsAt = zonedTimeToUtc(first, 0, timeZone);
    endsAt = zonedTimeToUtc(event.end?.date ?? addDaysToDate(first, 1), 0, timeZone);
  } else {
    startsAt = new Date(start.dateTime as string);
    endsAt = new Date(event.end?.dateTime ?? (start.dateTime as string));
  }
  if (Number.isNaN(startsAt.getTime())) return null;
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + 15 * 60_000);

  const seen = new Set<string>();
  const attendees: MappedAttendee[] = [];
  for (const a of event.attendees ?? []) {
    const email = a.email?.trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    attendees.push({
      email,
      name: a.displayName?.trim() || email,
      response: RESPONSES[a.responseStatus ?? ""] ?? "pendiente",
      isOrganizer: a.organizer === true || event.organizer?.email?.toLowerCase() === email,
      optional: a.optional === true,
    });
  }

  return {
    googleEventId: event.id,
    title: event.summary?.trim() || "(Sin título)",
    description: event.description ?? null,
    startsAt,
    endsAt,
    allDay,
    timeZone,
    location: event.location ?? null,
    meetUrl: meetUrlOf(event),
    htmlLink: event.htmlLink ?? null,
    etag: event.etag ?? null,
    organizerEmail: event.organizer?.email?.toLowerCase() ?? null,
    attendees,
  };
}

const excluded = (column: string) => sql.raw(`excluded."${column}"`);

type ApplyResult = { upserted: number; deleted: number; keptIds: Set<string> };

/** Writes one page of events into the owner's cache: cancelled and Cincel-owned ids are removed, the rest upserted. */
async function applyItems(staffId: string, items: GoogleCalendarEvent[], now: Date): Promise<ApplyResult> {
  const ids = items.map((e) => e.id);
  const mirrored = new Set((await syncRepository.listSyncedEvents(staffId)).map((e) => e.googleEventId));
  const cincelOwned = new Set<string>();
  if (ids.length > 0) {
    const rows = await db
      .select({ googleEventId: calendarEvents.googleEventId })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.source, "cincel"), inArray(calendarEvents.googleEventId, ids)));
    for (const r of rows) if (r.googleEventId) cincelOwned.add(r.googleEventId);
  }

  const toDelete: string[] = [];
  const toUpsert: MappedEvent[] = [];
  for (const item of items) {
    if (item.status === "cancelled" || cincelOwned.has(item.id) || mirrored.has(item.id)) {
      toDelete.push(item.id);
      continue;
    }
    const mapped = mapGoogleEvent(item);
    if (mapped) toUpsert.push(mapped);
    else toDelete.push(item.id);
  }

  let deleted = 0;
  if (toDelete.length > 0) {
    const removed = await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.source, "google"),
          eq(calendarEvents.ownerStaffId, staffId),
          inArray(calendarEvents.googleEventId, toDelete),
        ),
      )
      .returning({ id: calendarEvents.id });
    deleted = removed.length;
  }

  const keptIds = new Set<string>();
  let upserted = 0;
  for (let i = 0; i < toUpsert.length; i += UPSERT_BATCH) {
    const batch = toUpsert.slice(i, i + UPSERT_BATCH);
    const emails = [
      ...new Set(batch.flatMap((e) => [...e.attendees.map((a) => a.email), ...(e.organizerEmail ? [e.organizerEmail] : [])])),
    ];
    const staffByEmail = new Map<string, string>();
    if (emails.length > 0) {
      const people = await db
        .select({ id: staff.id, email: staff.email })
        .from(staff)
        .where(and(inArray(sql`lower(${staff.email})`, emails), isNull(staff.deletedAt)));
      for (const p of people) if (p.email) staffByEmail.set(p.email.toLowerCase(), p.id);
    }

    await db.transaction(async (tx) => {
      const saved = await tx
        .insert(calendarEvents)
        .values(
          batch.map((e) => ({
            source: "google" as const,
            ownerStaffId: staffId,
            organizerId: e.organizerEmail ? (staffByEmail.get(e.organizerEmail) ?? null) : null,
            title: e.title,
            description: e.description,
            startsAt: e.startsAt,
            endsAt: e.endsAt,
            allDay: e.allDay,
            timeZone: e.timeZone,
            location: e.location,
            meetUrl: e.meetUrl,
            status: "confirmada" as const,
            googleCalendarId: PRIMARY,
            googleEventId: e.googleEventId,
            googleEtag: e.etag,
            googleHtmlLink: e.htmlLink,
            syncedAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [calendarEvents.ownerStaffId, calendarEvents.googleEventId],
          targetWhere: sql`${calendarEvents.source} = 'google'`,
          set: {
            organizerId: excluded("organizer_id"),
            title: excluded("title"),
            description: excluded("description"),
            startsAt: excluded("starts_at"),
            endsAt: excluded("ends_at"),
            allDay: excluded("all_day"),
            timeZone: excluded("time_zone"),
            location: excluded("location"),
            meetUrl: excluded("meet_url"),
            status: excluded("status"),
            googleEtag: excluded("google_etag"),
            googleHtmlLink: excluded("google_html_link"),
            syncedAt: excluded("synced_at"),
            deletedAt: null,
            updatedAt: now,
          },
        })
        .returning({ id: calendarEvents.id, googleEventId: calendarEvents.googleEventId });

      const idByGoogleId = new Map(saved.map((r) => [r.googleEventId as string, r.id]));
      await tx.delete(calendarEventAttendees).where(
        inArray(
          calendarEventAttendees.eventId,
          saved.map((r) => r.id),
        ),
      );
      const attendeeRows = batch.flatMap((e) =>
        e.attendees.map((a) => ({
          eventId: idByGoogleId.get(e.googleEventId) as string,
          staffId: staffByEmail.get(a.email) ?? null,
          email: a.email,
          name: a.name,
          response: a.response,
          isOrganizer: a.isOrganizer,
          optional: a.optional,
        })),
      );
      if (attendeeRows.length > 0) await tx.insert(calendarEventAttendees).values(attendeeRows);
    });
    for (const e of batch) keptIds.add(e.googleEventId);
    upserted += batch.length;
  }
  return { upserted, deleted, keptIds };
}

type EventsPage = { items?: GoogleCalendarEvent[]; nextPageToken?: string; nextSyncToken?: string };

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type RefreshOptions = { force?: boolean; now?: Date; sleep?: Sleep };

/** The window of the cache around `now`. */
export function primaryWindow(now: Date): { timeMin: string; timeMax: string; from: string; to: string } {
  const from = new Date(now.getTime() - PRIMARY_WINDOW_PAST_DAYS * DAY_MS);
  const to = new Date(now.getTime() + PRIMARY_WINDOW_FUTURE_DAYS * DAY_MS);
  return { timeMin: from.toISOString(), timeMax: to.toISOString(), from: isoDay(from), to: isoDay(to) };
}

/**
 * Refreshes the viewer's own primary-calendar cache (BE §7.2): first run reads
 * the window and keeps `nextSyncToken`; later runs read the changes since the
 * token; a 410 resets it. Skipped when fresh (< 5 min) unless `force`. A
 * failure stores `primary_error`, leaves the cache as it was and throws an
 * `Error` whose message is the action code (`GOOGLE_REAUTH`, `GOOGLE_UNAVAILABLE`).
 */
export async function refreshPrimaryEvents(
  staffId: string,
  opts: RefreshOptions = {},
): Promise<{ upserted: number; deleted: number; syncedAt: string } | { skipped: "fresh" | "not_connected" | "no_grant" }> {
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? realSleep;

  const access = await accessFor(staffId);
  if (access.status === "not_connected") return { skipped: "not_connected" };
  if (access.status === "no_grant") return { skipped: "no_grant" };
  if (access.status === "reauth") {
    await syncRepository.savePrimarySyncState(staffId, { error: "REAUTH", syncToken: null });
    return { skipped: "no_grant" };
  }

  const state = await syncRepository.getPrimarySyncState(staffId);
  if (!opts.force && state?.syncedAt && now.getTime() - state.syncedAt.getTime() < PRIMARY_FRESH_MS && !state.error) {
    return { skipped: "fresh" };
  }

  const window = primaryWindow(now);
  const renew = addDaysToDate(isoDay(now), WINDOW_RENEW_DAYS);
  const incremental = !!state?.syncToken && !!state.windowTo && state.windowTo >= renew;

  try {
    const read = async (token: string, syncToken: string | null) => {
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;
      let upserted = 0;
      let deleted = 0;
      const kept = new Set<string>();
      do {
        const query: Record<string, string> = syncToken
          ? { syncToken, maxResults: PAGE_SIZE }
          : { timeMin: window.timeMin, timeMax: window.timeMax, singleEvents: "true", maxResults: PAGE_SIZE };
        if (pageToken) query.pageToken = pageToken;
        const page = await withRetry(
          () => calendarCall<EventsPage>(token, "GET", `/calendars/${PRIMARY}/events`, { query }),
          sleep,
        );
        const applied = await applyItems(staffId, page.items ?? [], now);
        upserted += applied.upserted;
        deleted += applied.deleted;
        for (const id of applied.keptIds) kept.add(id);
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      return { upserted, deleted, kept, nextSyncToken };
    };

    let result: Awaited<ReturnType<typeof read>>;
    let fullRead = !incremental;
    if (incremental) {
      try {
        result = await read(access.token, state?.syncToken ?? null);
      } catch (error) {
        if (!(error instanceof GoogleCalendarError && error.status === 410)) throw error;
        // The sync token expired: reset it and read the window again.
        await syncRepository.savePrimarySyncState(staffId, { syncToken: null });
        fullRead = true;
        result = await read(access.token, null);
      }
    } else {
      result = await read(access.token, null);
    }

    let deleted = result.deleted;
    if (fullRead) {
      // Whatever the full read did not return is gone from the window.
      const cached = await db
        .select({ id: calendarEvents.id, googleEventId: calendarEvents.googleEventId })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.source, "google"), eq(calendarEvents.ownerStaffId, staffId)));
      const stale = cached.filter((r) => r.googleEventId && !result.kept.has(r.googleEventId)).map((r) => r.id);
      if (stale.length > 0) {
        await db.delete(calendarEvents).where(inArray(calendarEvents.id, stale));
        deleted += stale.length;
      }
    }
    // Events that fell out of the back of the window.
    const pruned = await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.source, "google"),
          eq(calendarEvents.ownerStaffId, staffId),
          lt(calendarEvents.endsAt, new Date(window.timeMin)),
        ),
      )
      .returning({ id: calendarEvents.id });
    deleted += pruned.length;

    await syncRepository.savePrimarySyncState(staffId, {
      syncToken: result.nextSyncToken ?? null,
      syncedAt: now,
      error: null,
      windowFrom: window.from,
      windowTo: window.to,
    });
    return { upserted: result.upserted, deleted, syncedAt: now.toISOString() };
  } catch (error) {
    const failure = classifyGoogleError(error);
    const stored = failure === "NOT_ORGANIZER" || failure === "CONFLICT" || failure === "GONE" ? "UNAVAILABLE" : failure;
    await syncRepository.savePrimarySyncState(staffId, { error: stored });
    throw new Error(actionCodeOf(stored));
  }
}

// ── Write-through of Cincel meetings ────────────────────────────────────────

export type MeetingWriteOp = "create" | "update" | "cancel" | "retry";

export type MeetingWriteOptions = {
  /** Fields changed by an update; without it an update re-sends the whole meeting. */
  patch?: MeetingPatch;
  /** Ask Google for a Meet link on create (default true). */
  meet?: boolean;
  /** `false` asks Google not to email the attendees of this change (the "Avisar" switch). */
  notify?: boolean;
  /** The person making the change; anyone but the organizer keeps the change Cincel-only (`NOT_ORGANIZER`). */
  actorId?: string;
  sleep?: Sleep;
};

export type MeetingWriteOutcome =
  | { ok: true; googleEventId: string | null; etag: string | null; htmlLink: string | null; meetUrl: string | null }
  | { ok: false; error: GoogleFailure };

type MeetingRow = typeof calendarEvents.$inferSelect;
type TimedRow = Pick<MeetingRow, "allDay" | "timeZone">;

function timeOf(row: TimedRow, instant: Date): { dateTime?: string; date?: string; timeZone?: string } {
  if (row.allDay) return { date: localDateOf(instant, row.timeZone) };
  return { dateTime: instant.toISOString(), timeZone: row.timeZone };
}

/** The whole meeting as a Google event body. */
export function meetingBody(
  row: Pick<MeetingRow, "title" | "description" | "location" | "startsAt" | "endsAt" | "allDay" | "timeZone">,
  attendeeEmails: string[],
): GoogleEventWrite {
  return {
    summary: row.title,
    ...(row.description ? { description: row.description } : {}),
    ...(row.location ? { location: row.location } : {}),
    start: timeOf(row, row.startsAt),
    end: timeOf(row, row.endsAt),
    attendees: attendeeEmails.map((email) => ({ email })),
  };
}

/** Only the fields an update changes. */
export function meetingPatchBody(row: TimedRow, patch: MeetingPatch): GoogleEventWrite {
  const body: GoogleEventWrite = {};
  if (patch.title !== undefined) body.summary = patch.title;
  if (patch.location !== undefined) body.location = patch.location ?? "";
  if (patch.start !== undefined) body.start = timeOf(row, new Date(patch.start));
  if (patch.end !== undefined) body.end = timeOf(row, new Date(patch.end));
  if (patch.attendees !== undefined) body.attendees = patch.attendees.map((a) => ({ email: a.email.toLowerCase() }));
  return body;
}

async function loadMeeting(eventId: string): Promise<{ row: MeetingRow; attendeeEmails: string[] } | null> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.source, "cincel"), isNull(calendarEvents.deletedAt)))
    .limit(1);
  if (!row) return null;
  const attendees = await db.select().from(calendarEventAttendees).where(eq(calendarEventAttendees.eventId, eventId));
  let organizerEmail: string | null = null;
  if (row.organizerId) {
    const [org] = await db.select({ email: staff.email }).from(staff).where(eq(staff.id, row.organizerId)).limit(1);
    organizerEmail = org?.email?.toLowerCase() ?? null;
  }
  const attendeeEmails = [
    ...new Set(
      attendees
        .filter((a) => !a.isOrganizer)
        .map((a) => a.email.toLowerCase())
        .filter((email) => email !== organizerEmail),
    ),
  ];
  return { row, attendeeEmails };
}

async function recordFailure(eventId: string, failure: GoogleFailure): Promise<void> {
  // CONFLICT is not a stored state: the meeting is unchanged on the Google side.
  if (failure !== "CONFLICT") {
    await calendarEventsRepository.setGoogleSyncState(eventId, { error: failure });
  }
  if (failure === "UNAVAILABLE" || failure === "RATE_LIMITED") {
    await db
      .update(calendarEvents)
      .set({ googleSyncAttempts: sql`${calendarEvents.googleSyncAttempts} + 1` })
      .where(eq(calendarEvents.id, eventId));
  }
}

async function recordSuccess(
  eventId: string,
  state: { googleEventId: string | null; etag: string | null; htmlLink: string | null; meetUrl: string | null },
): Promise<void> {
  await calendarEventsRepository.setGoogleSyncState(eventId, { ...state, error: null });
  await db.update(calendarEvents).set({ googleSyncAttempts: 0 }).where(eq(calendarEvents.id, eventId));
}

/**
 * Writes a Cincel meeting to the organizer's primary calendar (BE §7.3):
 * create with a Meet link (`conferenceDataVersion=1`), patch with `If-Match`
 * and one retry on 412, cancel with a notice to the attendees. The outcome is
 * stored on the meeting row (`google_sync_error`); a Google failure never
 * removes the meeting. `retry` creates the event when it is not in Google yet
 * (or vanished) and patches it otherwise; creating on a retry never emails the
 * attendees again (BE §7.6). Meetings invited by Cincel (`invites_via =
 * 'cincel'`) always write with `sendUpdates=none`.
 */
export async function writeMeetingToGoogle(
  eventId: string,
  op: MeetingWriteOp,
  opts: MeetingWriteOptions = {},
): Promise<MeetingWriteOutcome> {
  const sleep = opts.sleep ?? realSleep;
  const loaded = await loadMeeting(eventId);
  if (!loaded) throw new Error("NOT_FOUND");
  const { row, attendeeEmails } = loaded;

  const fail = async (failure: GoogleFailure): Promise<MeetingWriteOutcome> => {
    await recordFailure(eventId, failure);
    return { ok: false, error: failure };
  };

  if (!row.organizerId || (opts.actorId && opts.actorId !== row.organizerId)) return fail("NOT_ORGANIZER");
  const staffId = row.organizerId;

  const access = await accessFor(staffId);
  if (access.status !== "ok") {
    if (access.status === "reauth") {
      await syncRepository.savePrimarySyncState(staffId, { error: "REAUTH" });
      return fail("REAUTH");
    }
    const state = await syncRepository.getPrimarySyncState(staffId);
    return fail(state?.error === "ACCESS_DENIED" ? "ACCESS_DENIED" : "NO_GRANT");
  }

  const sendUpdates: "all" | "none" = row.invitesVia === "cincel" || opts.notify === false ? "none" : "all";

  try {
    if (op === "cancel") {
      if (row.googleEventId && row.googleSyncError !== "GONE") {
        const googleEventId = row.googleEventId;
        await withRetry(() => deletePrimaryEvent(staffId, googleEventId, sendUpdates), sleep);
      }
      const state = { googleEventId: row.googleEventId, etag: row.googleEtag, htmlLink: row.googleHtmlLink, meetUrl: row.meetUrl };
      await recordSuccess(eventId, state);
      return { ok: true, ...state };
    }

    const exists = !!row.googleEventId && row.googleSyncError !== "GONE";

    if (op === "create" || !exists) {
      const body: GoogleEventWrite = {
        ...meetingBody(row, attendeeEmails),
        // A create after a retry (outage, connect, vanished event) never invites twice.
        sendUpdates: op === "create" ? sendUpdates : "none",
        ...(opts.meet === false
          ? {}
          : {
              conferenceData: {
                createRequest: { requestId: eventId, conferenceSolutionKey: { type: "hangoutsMeet" as const } },
              },
            }),
      };
      const created = await withRetry(() => insertPrimaryEvent(staffId, body), sleep);
      const state = {
        googleEventId: created.id,
        etag: created.etag ?? null,
        htmlLink: created.htmlLink ?? null,
        meetUrl: meetUrlOf(created) ?? row.meetUrl,
      };
      await recordSuccess(eventId, state);
      return { ok: true, ...state };
    }

    const googleEventId = row.googleEventId as string;
    const patchBody = op === "update" && opts.patch ? meetingPatchBody(row, opts.patch) : meetingBody(row, attendeeEmails);
    let etag = row.googleEtag ?? undefined;
    let updated: GoogleCalendarEvent | null = null;
    for (let attempt = 1; attempt <= 2 && !updated; attempt++) {
      try {
        updated = await withRetry(
          () => patchPrimaryEvent(staffId, googleEventId, patchBody, sendUpdates, { ifMatch: etag }),
          sleep,
        );
      } catch (error) {
        if (classifyGoogleError(error) !== "CONFLICT" || attempt === 2) throw error;
        // Changed in Google meanwhile: re-read it, then apply the patch on top once more.
        const current = await getPrimaryEvent(staffId, googleEventId);
        if (!current) return fail("GONE");
        etag = current.etag;
      }
    }
    const result = updated as GoogleCalendarEvent;
    const state = {
      googleEventId,
      etag: result.etag ?? null,
      htmlLink: result.htmlLink ?? row.googleHtmlLink,
      meetUrl: meetUrlOf(result) ?? row.meetUrl,
    };
    await recordSuccess(eventId, state);
    return { ok: true, ...state };
  } catch (error) {
    if (isGone(error) && row.googleEventId) return fail("GONE");
    return fail(classifyGoogleError(error));
  }
}

// ── Free/busy ───────────────────────────────────────────────────────────────

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: BusyInterval[]; errors?: { reason?: string }[] }>;
};

/** Busy intervals per email and the emails Google did not answer for, from a free/busy response. */
export function readFreeBusy(
  emails: string[],
  response: FreeBusyResponse,
): { busy: Record<string, BusyInterval[]>; unknown: string[] } {
  const calendars = new Map(Object.entries(response.calendars ?? {}).map(([id, value]) => [id.toLowerCase(), value]));
  const busy: Record<string, BusyInterval[]> = {};
  const unknown: string[] = [];
  for (const email of emails) {
    const entry = calendars.get(email);
    if (!entry || (entry.errors && entry.errors.length > 0)) {
      unknown.push(email);
      busy[email] = [];
      continue;
    }
    busy[email] = (entry.busy ?? []).filter((b) => b.start && b.end);
  }
  return { busy, unknown };
}

/** Sorts and merges overlapping intervals. */
export function mergeBusy(intervals: BusyInterval[]): BusyInterval[] {
  const sorted = [...intervals]
    .filter((b) => new Date(b.end) > new Date(b.start))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  const merged: BusyInterval[] = [];
  for (const b of sorted) {
    const last = merged[merged.length - 1];
    if (last && new Date(b.start) <= new Date(last.end)) {
      if (new Date(b.end) > new Date(last.end)) last.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }
  return merged;
}

/** Cincel's own picture of the staff behind `emails`: meetings, approved absences and the jornada. */
async function cincelBusy(emails: string[], timeMin: Date, timeMax: Date): Promise<Record<string, BusyInterval[]>> {
  const out: Record<string, BusyInterval[]> = {};
  const people = await db
    .select({ id: staff.id, email: staff.email })
    .from(staff)
    .where(and(inArray(sql`lower(${staff.email})`, emails), isNull(staff.deletedAt)));
  if (people.length === 0) return out;
  const emailOf = new Map(people.map((p) => [p.id, (p.email as string).toLowerCase()]));
  const staffIds = people.map((p) => p.id);
  for (const p of people) out[(p.email as string).toLowerCase()] = [];

  // Confirmed Cincel meetings where the person attends (and has not declined) or organizes.
  const attending = await db
    .select({ staffId: calendarEventAttendees.staffId, startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt })
    .from(calendarEventAttendees)
    .innerJoin(calendarEvents, eq(calendarEvents.id, calendarEventAttendees.eventId))
    .where(
      and(
        inArray(calendarEventAttendees.staffId, staffIds),
        ne(calendarEventAttendees.response, "rechaza"),
        eq(calendarEvents.source, "cincel"),
        eq(calendarEvents.status, "confirmada"),
        isNull(calendarEvents.deletedAt),
        lt(calendarEvents.startsAt, timeMax),
        sql`${calendarEvents.endsAt} > ${timeMin}`,
      ),
    );
  const organizing = await db
    .select({ staffId: calendarEvents.organizerId, startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt })
    .from(calendarEvents)
    .where(
      and(
        inArray(calendarEvents.organizerId, staffIds),
        eq(calendarEvents.source, "cincel"),
        eq(calendarEvents.status, "confirmada"),
        isNull(calendarEvents.deletedAt),
        lt(calendarEvents.startsAt, timeMax),
        sql`${calendarEvents.endsAt} > ${timeMin}`,
      ),
    );
  for (const r of [...attending, ...organizing]) {
    const email = r.staffId ? emailOf.get(r.staffId) : undefined;
    if (email) out[email].push({ start: r.startsAt.toISOString(), end: r.endsAt.toISOString() });
  }

  const settings = await getTimeTrackingSettings();
  const dates = eachDate(localDateOf(timeMin, DEFAULT_TZ), localDateOf(timeMax, DEFAULT_TZ), FREE_BUSY_MAX_DAYS + 2);
  const absences = await approvedAbsences(db, { from: dates[0], to: dates[dates.length - 1], staffIds });
  const at = (date: string, minutes: number) => zonedTimeToUtc(date, minutes, DEFAULT_TZ).toISOString();
  const dayStart = minutesOf(settings.dayStart);
  const dayEnd = minutesOf(settings.dayEnd);
  for (const date of dates) {
    const works = settings.workDays.includes(weekdayOf(date));
    const next = addDaysToDate(date, 1);
    for (const p of people) {
      const email = (p.email as string).toLowerCase();
      const absent = absences.some((a) => a.staffId === p.id && a.from <= date && date <= a.to);
      if (!works || absent) {
        out[email].push({ start: at(date, 0), end: at(next, 0) });
      } else {
        out[email].push({ start: at(date, 0), end: at(date, dayStart) }, { start: at(date, dayEnd), end: at(next, 0) });
      }
    }
  }
  return out;
}

/**
 * Busy times of up to 20 people for up to 31 days (BE §7.4): Google's
 * free/busy with the caller's token, merged with Cincel's meetings, approved
 * absences and the jornada of the people who are staff. Emails Google can't
 * answer for (outside the domain, sharing off, no grant) come back in
 * `unknown`; the planners treat them as free.
 */
export async function freeBusy(
  staffId: string,
  emails: string[],
  timeMin: string,
  timeMax: string,
  opts: { sleep?: Sleep } = {},
): Promise<{ busy: Record<string, BusyInterval[]>; unknown: string[] }> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length > FREE_BUSY_MAX_EMAILS) throw new Error("INVALID");
  const min = new Date(timeMin);
  const max = new Date(timeMax);
  if (Number.isNaN(min.getTime()) || Number.isNaN(max.getTime()) || max <= min) throw new Error("INVALID");
  if (max.getTime() - min.getTime() > FREE_BUSY_MAX_DAYS * DAY_MS) throw new Error("RANGE_TOO_LONG");
  if (wanted.length === 0) return { busy: {}, unknown: [] };

  let google: { busy: Record<string, BusyInterval[]>; unknown: string[] } = {
    busy: Object.fromEntries(wanted.map((e) => [e, [] as BusyInterval[]])),
    unknown: [...wanted],
  };
  const access = await accessFor(staffId);
  if (access.status === "ok") {
    try {
      const response = await withRetry(
        () =>
          calendarCall<FreeBusyResponse>(access.token, "POST", "/freeBusy", {
            body: { timeMin: min.toISOString(), timeMax: max.toISOString(), items: wanted.map((id) => ({ id })) },
          }),
        opts.sleep ?? realSleep,
      );
      google = readFreeBusy(wanted, response);
    } catch (error) {
      // No free/busy this time: the Cincel data still answers.
      if (classifyGoogleError(error) === "REAUTH") await syncRepository.savePrimarySyncState(staffId, { error: "REAUTH" });
    }
  } else if (access.status === "reauth") {
    await syncRepository.savePrimarySyncState(staffId, { error: "REAUTH" });
  }

  const own = await cincelBusy(wanted, min, max);
  const busy: Record<string, BusyInterval[]> = {};
  for (const email of wanted) busy[email] = mergeBusy([...(google.busy[email] ?? []), ...(own[email] ?? [])]);
  return { busy, unknown: google.unknown };
}
