import { and, eq, inArray, isNotNull, like } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { googleCalendarEvents, googleCalendarSyncs, googleOauthAccounts } from "@/lib/db/schema";
import { hasGrantedScope } from "@/lib/google/staff-oauth";
import type { SyncedEvent } from "@/lib/google/calendar-sync";

export type GoogleCalendarSyncState = {
  calendarId: string | null;
  enabled: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
};

export async function getCalendarSync(staffId: string): Promise<GoogleCalendarSyncState | null> {
  const [row] = await db.select().from(googleCalendarSyncs).where(eq(googleCalendarSyncs.staffId, staffId)).limit(1);
  if (!row) return null;
  return { calendarId: row.calendarId, enabled: row.enabled, lastSyncedAt: row.lastSyncedAt, lastError: row.lastError };
}

export type GooglePrimarySyncState = { syncedAt: Date | null; error: string | null };

/** Where the viewer's primary-calendar events cache stands (Calendario, FE §6.3). */
export async function getPrimarySync(staffId: string): Promise<GooglePrimarySyncState | null> {
  const [row] = await db
    .select({ syncedAt: googleCalendarSyncs.primarySyncedAt, error: googleCalendarSyncs.primaryError })
    .from(googleCalendarSyncs)
    .where(eq(googleCalendarSyncs.staffId, staffId))
    .limit(1);
  return row ?? null;
}

export async function upsertCalendarSync(
  staffId: string,
  patch: Partial<GoogleCalendarSyncState>
): Promise<void> {
  await db
    .insert(googleCalendarSyncs)
    .values({ staffId, ...patch })
    .onConflictDoUpdate({ target: googleCalendarSyncs.staffId, set: { ...patch, updatedAt: new Date() } });
}

export async function listSyncedEvents(staffId: string): Promise<SyncedEvent[]> {
  return db
    .select({
      eventKey: googleCalendarEvents.eventKey,
      googleEventId: googleCalendarEvents.googleEventId,
      contentHash: googleCalendarEvents.contentHash,
    })
    .from(googleCalendarEvents)
    .where(eq(googleCalendarEvents.staffId, staffId));
}

export async function saveSyncedEvent(staffId: string, event: SyncedEvent): Promise<void> {
  await db
    .insert(googleCalendarEvents)
    .values({ staffId, ...event })
    .onConflictDoUpdate({
      target: [googleCalendarEvents.staffId, googleCalendarEvents.eventKey],
      set: { googleEventId: event.googleEventId, contentHash: event.contentHash, updatedAt: new Date() },
    });
}

export async function deleteSyncedEvents(staffId: string, eventKeys?: string[]): Promise<void> {
  if (eventKeys && eventKeys.length === 0) return;
  await db
    .delete(googleCalendarEvents)
    .where(
      eventKeys
        ? and(eq(googleCalendarEvents.staffId, staffId), inArray(googleCalendarEvents.eventKey, eventKeys))
        : eq(googleCalendarEvents.staffId, staffId)
    );
}

export type PrimarySyncState = {
  syncToken: string | null;
  syncedAt: Date | null;
  error: string | null;
  windowFrom: string | null;
  windowTo: string | null;
};

/** The primary-calendar cache state of a staff member (Calendario BE §3.7). */
export async function getPrimarySyncState(staffId: string): Promise<PrimarySyncState | null> {
  const [row] = await db.select().from(googleCalendarSyncs).where(eq(googleCalendarSyncs.staffId, staffId)).limit(1);
  if (!row) return null;
  return {
    syncToken: row.primarySyncToken,
    syncedAt: row.primarySyncedAt,
    error: row.primaryError,
    windowFrom: row.primaryWindowFrom,
    windowTo: row.primaryWindowTo,
  };
}

/** Writes part of the primary-calendar cache state, creating the sync row when missing. */
export async function savePrimarySyncState(staffId: string, patch: Partial<PrimarySyncState>): Promise<void> {
  const set = {
    ...(patch.syncToken !== undefined ? { primarySyncToken: patch.syncToken } : {}),
    ...(patch.syncedAt !== undefined ? { primarySyncedAt: patch.syncedAt } : {}),
    ...(patch.error !== undefined ? { primaryError: patch.error } : {}),
    ...(patch.windowFrom !== undefined ? { primaryWindowFrom: patch.windowFrom } : {}),
    ...(patch.windowTo !== undefined ? { primaryWindowTo: patch.windowTo } : {}),
  };
  await db
    .insert(googleCalendarSyncs)
    .values({ staffId, ...set })
    .onConflictDoUpdate({ target: googleCalendarSyncs.staffId, set: { ...set, updatedAt: new Date() } });
}

/** Staff whose Google grant includes `calendar.events` and `calendar.freebusy` (candidates of the refresh cron). */
export async function listStaffWithEventsGrant(): Promise<string[]> {
  const rows = await db
    .select({ staffId: googleOauthAccounts.staffId, scope: googleOauthAccounts.scope })
    .from(googleOauthAccounts)
    .where(and(isNotNull(googleOauthAccounts.googleSub), like(googleOauthAccounts.scope, "%calendar.events%")));
  return rows.filter((r) => hasGrantedScope(r.scope, "calendar_events")).map((r) => r.staffId);
}
