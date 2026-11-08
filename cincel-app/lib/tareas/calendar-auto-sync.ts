/**
 * The Calendario's automatic Google Calendar sync runs at most once per
 * browser session (Query Migration 4c, #957; plan §4.8 rule 5). A module flag
 * covers remounts in one page; the `sessionStorage` flag covers reloads in the
 * same tab. Never on the server.
 *
 * An identity change (logout, another user) clears both through the UI store
 * reset, so the next user's first visit syncs again.
 */
import { registerUiStoreReset } from "@/lib/query/reset-client-state";
import {
  readSessionStorage,
  removeSessionStorage,
  writeSessionStorage,
} from "@/lib/repositories/browser-state-repository";

export const CALENDAR_AUTO_SYNC_KEY = "cincel.ui.tareas.calendarSynced.v1";

let claimed = false;

/** True only for the first call of the browser session; it marks the session as synced. */
export function claimCalendarAutoSync(): boolean {
  if (typeof window === "undefined" || claimed) return false;
  claimed = true;
  if (readSessionStorage(CALENDAR_AUTO_SYNC_KEY) === "1") return false;
  writeSessionStorage(CALENDAR_AUTO_SYNC_KEY, "1");
  return true;
}

/** Forgets the claim (identity change, tests). */
export function resetCalendarAutoSync(): void {
  claimed = false;
  removeSessionStorage(CALENDAR_AUTO_SYNC_KEY);
}

registerUiStoreReset(resetCalendarAutoSync);
