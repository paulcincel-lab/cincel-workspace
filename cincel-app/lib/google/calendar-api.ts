import "server-only";

import type { GoogleEventBody } from "@/lib/google/calendar-sync";

/**
 * Minimal Google Calendar v3 client over fetch, authenticated with the
 * caller's own OAuth token (scope `calendar.app.created`: the app can only
 * see and edit calendars it created — never the rest of the user's agenda).
 */

const API = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

/** The calendar or event no longer exists on Google's side (the user deleted it). */
export function isGone(error: unknown): boolean {
  return error instanceof GoogleCalendarError && (error.status === 404 || error.status === 410);
}

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Google Calendar respondió ${response.status}`;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      // Non-JSON error body — keep the status message.
    }
    throw new GoogleCalendarError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function createCalendar(token: string, summary: string, timeZone: string): Promise<string> {
  const created = await call<{ id: string }>(token, "POST", "/calendars", { summary, timeZone });
  return created.id;
}

/** Throws a 404 GoogleCalendarError (see isGone) when the user deleted the calendar. */
export async function getCalendar(token: string, calendarId: string): Promise<void> {
  await call(token, "GET", `/calendars/${encodeURIComponent(calendarId)}`);
}

export async function insertEvent(token: string, calendarId: string, event: GoogleEventBody): Promise<string> {
  const created = await call<{ id: string }>(token, "POST", `/calendars/${encodeURIComponent(calendarId)}/events`, event);
  return created.id;
}

export async function patchEvent(token: string, calendarId: string, eventId: string, event: GoogleEventBody): Promise<void> {
  await call(token, "PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, event);
}

/** Already-deleted events count as deleted. */
export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}
