/**
 * Primary-calendar read cache, write-through and free/busy (Calendario BE §7).
 * Server-only. Bodies belong to the Google issues; until then they throw
 * `not implemented`, and the loaders never call them.
 */
import "server-only";

import type { BusyInterval } from "@/lib/assistant/agenda/free-slots";
import { notImplemented } from "@/lib/stubs";

/** Window: today − 35 days to today + 120 days; skipped when fresh (< 5 min) unless `force`. */
export async function refreshPrimaryEvents(
  staffId: string,
  opts?: { force?: boolean; now?: Date },
): Promise<{ upserted: number; deleted: number; syncedAt: string } | { skipped: "fresh" | "not_connected" | "no_grant" }> {
  return notImplemented("refreshPrimaryEvents", staffId, opts);
}

/** Max 20 emails and 31 days; emails Google can't answer for come back in `unknown`. */
export async function freeBusy(
  staffId: string,
  emails: string[],
  timeMin: string,
  timeMax: string,
): Promise<{ busy: Record<string, BusyInterval[]>; unknown: string[] }> {
  return notImplemented("freeBusy", staffId, emails, timeMin, timeMax);
}
