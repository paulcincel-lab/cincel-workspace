/**
 * Client-side unread count of the Bandeja (redesign FE §3.1 "Badges
 * freshness", §6). The layout computes `unreadCount` on each full render;
 * between renders `Inbox` publishes the value from its 60 s poll and from
 * mark-read, and the sidebar's Mi espacio badge reads it with
 * `useBandejaUnread(serverCount)`. Client-safe, no server imports.
 */
import { useSyncExternalStore } from "react";

let current: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publish the latest unread count (negative values clamp to 0). */
export function publishBandejaUnread(count: number): void {
  const next = Math.max(0, Math.floor(count));
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/** The last published count, or null when nothing was published yet. */
export function readBandejaUnread(): number | null {
  return current;
}

/** Test helper: forget the published value. */
export function resetBandejaUnread(): void {
  current = null;
  for (const listener of listeners) listener();
}

/** The live unread count: the last published value, else the server's count. */
export function useBandejaUnread(serverCount: number): number {
  const published = useSyncExternalStore(subscribe, readBandejaUnread, () => null);
  return published ?? serverCount;
}
