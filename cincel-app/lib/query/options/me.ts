import { queryOptions } from "@tanstack/react-query";

import { fetchMyProfileAction } from "@/lib/actions/page-data/me-actions";
import { fetchMyTodayAction } from "@/lib/actions/time-tracking-actions";
import { qk, STALE } from "@/lib/query/keys";
import type { TodayStatus } from "@/lib/types/redesign";
import type { MyProfile } from "@/lib/types/shell";

export type { MyProfile } from "@/lib/types/shell";

/** How often `me.today` refetches in the background (`TIME_CLOCK_RESYNC_MS`). */
export const ME_TODAY_REFETCH_MS = 5 * 60_000;

/**
 * The caller's clock day (plan §5 Phase 1b): 60 s stale, refetched every
 * 5 min and on window focus. `initial` is the layout's `TodayStatus`.
 * Consumers move onto it in Phase 2.
 */
export function meTodayOptions(initial?: TodayStatus) {
  return queryOptions<TodayStatus>({
    queryKey: qk.me.today(),
    queryFn: () => fetchMyTodayAction(),
    staleTime: STALE.meToday,
    refetchInterval: ME_TODAY_REFETCH_MS,
    refetchOnWindowFocus: true,
    initialData: initial,
  });
}

/**
 * The caller's own `{ id, name, photoUrl }` (S2): 5 min stale, seeded from
 * the layout's session. The photo upload and removal write it with
 * `setQueryData` (`components/shell/photo-upload.ts`). The action reads the
 * staff id from the session only, so it never returns another person.
 */
export function meProfileOptions(initial?: MyProfile) {
  return queryOptions<MyProfile>({
    queryKey: qk.me.profile(),
    queryFn: () => fetchMyProfileAction(),
    staleTime: STALE.meProfile,
    initialData: initial,
  });
}
