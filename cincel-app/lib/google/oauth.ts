import "server-only";

/*
 * Shared Google scope helpers. The old "connect any Google account" flow and
 * its legacy token refresh are gone: staff grant Drive and Calendar through
 * sign-in consent (lib/google/staff-oauth.ts).
 */

/**
 * Asked for only when someone turns on Google Calendar sync (#434), as an
 * incremental grant — Drive-only users are never asked for calendar access.
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

/** Whether a stored space-separated OAuth scope string includes `scope`. */
export function hasScope(granted: string | null | undefined, scope: string): boolean {
  return (granted ?? "").split(/\s+/).includes(scope);
}
