import { queryOptions, type QueryKey } from "@tanstack/react-query";

import {
  fetchCalendarFeedStatusAction,
  fetchGoogleCalendarSyncStatusAction,
  type GoogleCalendarSyncStatus,
} from "@/lib/actions/calendar-actions";
import { qk, STALE } from "@/lib/query/keys";

/**
 * The viewer's calendar integration status (Calendario › Sincronizar and
 * Ajustes › Integraciones). Both live under
 * `qk.ajustes.page('integraciones', { part: 'calendar' })`, so invalidating
 * `ajustes.page('integraciones')` refetches them.
 */
export function googleCalendarSyncStatusOptions() {
  return queryOptions<GoogleCalendarSyncStatus>({
    queryKey: qk.ajustes.page("integraciones", { part: "calendar", source: "google-sync" }),
    queryFn: () => fetchGoogleCalendarSyncStatusAction(),
    staleTime: STALE.ajustes,
  });
}

export function calendarFeedStatusOptions() {
  return queryOptions<{ enabled: boolean }>({
    queryKey: qk.ajustes.page("integraciones", { part: "calendar", source: "feed" }),
    queryFn: () => fetchCalendarFeedStatusAction(),
    staleTime: STALE.ajustes,
  });
}

/**
 * What a calendar sync or feed change invalidates (#954 Invalidations): every
 * `tareas.calendar` entry and the Integraciones settings.
 */
export const CALENDAR_INTEGRATION_INVALIDATE: readonly QueryKey[] = [
  [...qk.tareas.all, "calendar"],
  qk.ajustes.page("integraciones"),
];
