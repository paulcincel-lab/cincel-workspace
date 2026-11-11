/**
 * `calendar_events` and attendees: CRUD and visibility (Calendario BE §3.2, §3.3, §8). Server-only.
 * Writes throw until the owning issue (Phase 2) replaces the bodies; reads return safe defaults.
 */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { notImplemented, stubDefault } from "@/lib/stubs";
import type { CalEventItem, MeetingDetail, MeetingDraft, MeetingPatch } from "@/lib/types/calendario";

export async function getEventItem(user: AuthenticatedUser, eventId: string): Promise<CalEventItem | null> {
  return stubDefault(null, user, eventId);
}

export async function getMeetingDetail(user: AuthenticatedUser, eventId: string): Promise<MeetingDetail | null> {
  return stubDefault(null, user, eventId);
}

/** Creates a Cincel meeting row with its attendees; `invitesVia` is set once and never changes. */
export async function createEvent(
  user: AuthenticatedUser,
  draft: MeetingDraft,
  opts: { invitesVia: "google" | "cincel"; googleSyncError?: string | null },
): Promise<CalEventItem> {
  return notImplemented("createEvent", user, draft, opts);
}

export async function updateEvent(user: AuthenticatedUser, eventId: string, patch: MeetingPatch): Promise<CalEventItem> {
  return notImplemented("updateEvent", user, eventId, patch);
}

/** Cancel is a status, never a delete (history rule). */
export async function cancelEvent(user: AuthenticatedUser, eventId: string): Promise<{ eventId: string }> {
  return notImplemented("cancelEvent", user, eventId);
}

/** Stores the outcome of a Google write-through on the event row. */
export async function setGoogleSyncState(
  eventId: string,
  state: { googleEventId?: string | null; etag?: string | null; htmlLink?: string | null; meetUrl?: string | null; error: string | null },
): Promise<void> {
  return notImplemented("setGoogleSyncState", eventId, state);
}
