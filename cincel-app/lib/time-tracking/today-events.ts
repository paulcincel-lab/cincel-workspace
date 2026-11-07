/**
 * Client-side sync of the caller's `TodayStatus` between the shell's clock
 * surfaces (redesign FE §3.10, §3.13). A clock action outside the sidebar
 * (login prompt, command palette, assistant) publishes the returned status so
 * `TimeClock` updates at once, without a server revalidation (clock
 * actions revalidate nothing). Client-safe, no dependencies.
 */
import type { TodayStatus } from "@/lib/types/redesign";

/** `window` event carrying the latest `TodayStatus` as `detail`. */
export const TODAY_STATUS_EVENT = "cincel:today-status";

/** Publishes the latest status; a no-op outside the browser. */
export function publishTodayStatus(status: TodayStatus): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TodayStatus>(TODAY_STATUS_EVENT, { detail: status }));
}

/** Subscribes to published statuses; returns the unsubscribe function. */
export function subscribeTodayStatus(listener: (status: TodayStatus) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => listener((event as CustomEvent<TodayStatus>).detail);
  window.addEventListener(TODAY_STATUS_EVENT, handler);
  return () => window.removeEventListener(TODAY_STATUS_EVENT, handler);
}
