import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { googleCalendarEvents, googleCalendarSyncs } from "@/lib/db/schema";
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
