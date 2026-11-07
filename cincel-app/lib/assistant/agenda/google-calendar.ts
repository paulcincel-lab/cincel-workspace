import "server-only";

import { GoogleCalendarError, isGone } from "@/lib/google/calendar-api";
import { STAFF_OAUTH_EXTRA_SCOPES, type StaffOauthScope } from "@/lib/google/staff-oauth";
import { getStaffAccessToken } from "@/lib/google/staff-token";
import * as syncRepository from "@/lib/repositories/google-calendar-sync-repository";

/**
 * Google Calendar access of the agenda assistant tools (redesign BE §10.3,
 * §11.1, Annex C3), always with the caller's own token:
 * - Reads: the caller's "Cincel" calendar (`calendar` grant,
 *   `calendar.app.created`), leaving out the events Cincel mirrors there
 *   itself; plus the primary calendar once the `calendar_events` grant exists.
 * - Writes (event create / patch / delete on the primary calendar with
 *   attendees): need the `calendar_events` incremental grant
 *   (`calendar.events`). That grant is not offered by the sign-in consent
 *   yet, so `calendarEventsGrantAvailable()` is false and the write tools are
 *   never offered to the model.
 */

/** Key of the incremental grant the event writes need (`?scope=calendar_events`). */
export const CALENDAR_EVENTS_GRANT = "calendar_events";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const API = "https://www.googleapis.com/calendar/v3";
const PRIMARY = "primary";
const MAX_EVENTS = 250;

/** Whether the staff OAuth flow can grant `calendar.events` (Annex C3, out of scope today). */
export function calendarEventsGrantAvailable(scopes: Readonly<Record<string, string>> = STAFF_OAUTH_EXTRA_SCOPES): boolean {
  return Object.prototype.hasOwnProperty.call(scopes, CALENDAR_EVENTS_GRANT);
}

export type GoogleEventTime = { dateTime?: string; date?: string; timeZone?: string };

export type GoogleCalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  transparency?: string;
  attendees?: { email?: string; displayName?: string; responseStatus?: string; self?: boolean }[];
  organizer?: { email?: string; self?: boolean };
};

export type GoogleEventWrite = {
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: { email: string }[];
};

/** The caller has not granted the scope a call needs. */
export class CalendarScopeMissingError extends Error {
  constructor() {
    super("SCOPE_MISSING: calendar.events");
    this.name = "CalendarScopeMissingError";
  }
}

async function call<T>(
  token: string,
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : "";
  const response = await fetch(`${API}${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Google Calendar respondió ${response.status}`;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // Non-JSON error body: keep the status message.
    }
    throw new GoogleCalendarError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function listCalendarEvents(token: string, calendarId: string, timeMin: string, timeMax: string) {
  const data = await call<{ items?: GoogleCalendarEvent[] }>(token, "GET", `/calendars/${encodeURIComponent(calendarId)}/events`, {
    query: {
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(MAX_EVENTS),
    },
  });
  return (data.items ?? []).filter((e) => e.status !== "cancelled");
}

/** The access token of the `calendar_events` grant, or null without it. */
async function eventsToken(staffId: string): Promise<string | null> {
  if (!calendarEventsGrantAvailable()) return null;
  const result = await getStaffAccessToken(staffId, CALENDAR_EVENTS_GRANT as string as StaffOauthScope);
  return result.status === "ok" ? result.accessToken : null;
}

async function requireEventsToken(staffId: string): Promise<string> {
  const token = await eventsToken(staffId);
  if (!token) throw new CalendarScopeMissingError();
  return token;
}

export type OwnGoogleEvents = {
  /** The caller granted Calendar access. */
  connected: boolean;
  events: GoogleCalendarEvent[];
  /** Spanish note when Google could not be read. */
  error?: string;
};

/**
 * The caller's own Google events in `[timeMin, timeMax)`: their Cincel
 * calendar minus Cincel's own mirrored task events, plus the primary
 * calendar when the `calendar_events` grant is present. Never another
 * person's calendar (BE §9.1 owner-only data).
 */
export async function listOwnGoogleEvents(staffId: string, timeMin: string, timeMax: string): Promise<OwnGoogleEvents> {
  const appToken = await getStaffAccessToken(staffId, "calendar");
  const primaryToken = await eventsToken(staffId);
  if (appToken.status !== "ok" && !primaryToken) return { connected: false, events: [] };

  const events: GoogleCalendarEvent[] = [];
  try {
    if (appToken.status === "ok") {
      const sync = await syncRepository.getCalendarSync(staffId);
      if (sync?.calendarId) {
        const mirrored = new Set((await syncRepository.listSyncedEvents(staffId)).map((e) => e.googleEventId));
        try {
          const own = await listCalendarEvents(appToken.accessToken, sync.calendarId, timeMin, timeMax);
          events.push(...own.filter((e) => !mirrored.has(e.id)));
        } catch (error) {
          // The user deleted the Cincel calendar in Google: nothing to read there.
          if (!isGone(error)) throw error;
        }
      }
    }
    if (primaryToken) {
      events.push(...(await listCalendarEvents(primaryToken, PRIMARY, timeMin, timeMax)));
    }
  } catch (error) {
    const message = error instanceof GoogleCalendarError && error.status === 401
      ? "Google rechazó el acceso. Vuelve a conectar tu cuenta de Google."
      : "No se pudo leer tu calendario de Google.";
    return { connected: true, events, error: message };
  }
  const seen = new Set<string>();
  const unique = events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
  return { connected: true, events: unique };
}

/** Busy intervals (timed, not transparent) of the caller's Google events. */
export function busyIntervalsOf(events: GoogleCalendarEvent[]): { start: string; end: string }[] {
  return events
    .filter((e) => e.transparency !== "transparent" && e.start?.dateTime && e.end?.dateTime)
    .map((e) => ({ start: e.start!.dateTime!, end: e.end!.dateTime! }));
}

/** Inserts on the caller's primary calendar and emails the attendees. */
export async function insertPrimaryEvent(staffId: string, event: GoogleEventWrite): Promise<GoogleCalendarEvent> {
  const token = await requireEventsToken(staffId);
  return call<GoogleCalendarEvent>(token, "POST", `/calendars/${PRIMARY}/events`, {
    query: { sendUpdates: "all" },
    body: event,
  });
}

/** The event on the caller's primary calendar, or null when it no longer exists. */
export async function getPrimaryEvent(staffId: string, eventId: string): Promise<GoogleCalendarEvent | null> {
  const token = await requireEventsToken(staffId);
  try {
    const event = await call<GoogleCalendarEvent>(token, "GET", `/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`);
    return event.status === "cancelled" ? null : event;
  } catch (error) {
    if (isGone(error)) return null;
    throw error;
  }
}

export async function patchPrimaryEvent(
  staffId: string,
  eventId: string,
  patch: GoogleEventWrite,
  sendUpdates: "all" | "none" = "all",
): Promise<GoogleCalendarEvent> {
  const token = await requireEventsToken(staffId);
  return call<GoogleCalendarEvent>(token, "PATCH", `/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`, {
    query: { sendUpdates },
    body: patch,
  });
}

/** Cancels for every attendee (`sendUpdates=all`); an already-deleted event counts as deleted. */
export async function deletePrimaryEvent(staffId: string, eventId: string): Promise<void> {
  const token = await requireEventsToken(staffId);
  try {
    await call(token, "DELETE", `/calendars/${PRIMARY}/events/${encodeURIComponent(eventId)}`, {
      query: { sendUpdates: "all" },
    });
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}
