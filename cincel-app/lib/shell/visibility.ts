/**
 * Shell entry-point gates (redesign FE §3.1, §20 Rule 1): an entry point that
 * would call a stub stays hidden while its `IMPLEMENTED` flag is false or its
 * read action reports it disabled. Pure; used by server and client parts.
 */
import { IMPLEMENTED as ASSISTANT_IMPLEMENTED } from "@/lib/actions/assistant-actions.flags";
import { IMPLEMENTED as NOTIFICATIONS_IMPLEMENTED } from "@/lib/actions/notifications-actions.flags";
import { IMPLEMENTED as SEARCH_IMPLEMENTED } from "@/lib/actions/search-actions.flags";
import { IMPLEMENTED as TIME_TRACKING_IMPLEMENTED } from "@/lib/actions/time-tracking-actions.flags";
import type { TodayStatus } from "@/lib/types/redesign";

/** Search button and ⌘K palette: once `searchWorkspaceAction` is implemented. */
export function isSearchVisible(): boolean {
  return SEARCH_IMPLEMENTED.searchWorkspaceAction;
}

/** Time clock slot: once `clockInAction` is implemented and `fetchMyTodayAction` reports it enabled for the viewer. */
export function isTimeClockVisible(today: TodayStatus | null): boolean {
  return TIME_TRACKING_IMPLEMENTED.clockInAction && today !== null && today.enabled;
}

/** Bandeja badge slot: once `fetchNotificationsAction` is implemented. */
export function isBandejaBadgeVisible(): boolean {
  return NOTIFICATIONS_IMPLEMENTED.fetchNotificationsAction;
}

/** Assistant button and sheet: once the assistant threads are implemented, never on /asistente. */
export function isAssistantVisible(pathname: string | null, hideAssistant: boolean | undefined): boolean {
  if (hideAssistant) return false;
  if (pathname === "/asistente" || pathname?.startsWith("/asistente/")) return false;
  return ASSISTANT_IMPLEMENTED.fetchAssistantThreadAction;
}
