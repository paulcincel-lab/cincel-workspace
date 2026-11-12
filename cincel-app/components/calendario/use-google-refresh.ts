"use client";

import { useCallback, useMemo, useState } from "react";

import { refreshGoogleEventsAction } from "@/lib/actions/calendario-actions";
import { canAutoRefresh, GOOGLE_STATUS_COPY, type GoogleInfo } from "@/lib/calendario/google-status";
import { useActionMutation } from "@/lib/query/mutation";
import { CALENDAR_INTEGRATION_INVALIDATE } from "@/lib/query/options/calendar";

import { isGoogleStale, useRefreshOnce } from "./use-refresh-once";

/** The `qk.calendario.range` family: every cached range refetches after a refresh. */
const RANGE_FAMILY = ["calendario", "range"] as const;

export type GoogleRefresh = {
  /** Runs the refresh now, ignoring the 5 min freshness ("Actualizar"). */
  refresh(): void;
  refreshing: boolean;
  /** "No se pudo actualizar Google Calendar." after a failed refresh, else null. */
  error: string | null;
};

/**
 * Google refresh of the page (FE §6.3, F8): `refreshGoogleEventsAction` as a
 * mutation. It runs by itself at most once per session, when the grant is live
 * and `google.syncedAt` is older than 5 minutes; "Actualizar" runs it with `force`.
 */
export function useGoogleRefresh(google: GoogleInfo): GoogleRefresh {
  const [error, setError] = useState<string | null>(null);
  const mutation = useActionMutation<{ force: boolean }, { syncedAt: string | null }>(
    ({ force }) => refreshGoogleEventsAction(force ? { force: true } : undefined),
    {
      invalidate: [RANGE_FAMILY, ...CALENDAR_INTEGRATION_INVALIDATE],
      onFormError: () => setError(GOOGLE_STATUS_COPY.failed),
    },
  );
  const { mutate, isPending } = mutation;

  const run = useCallback(
    (force: boolean) => {
      setError(null);
      mutate({ force });
    },
    [mutate],
  );
  const auto = useMemo(() => ({ mutate: () => run(false) }), [run]);
  useRefreshOnce(auto, canAutoRefresh(google) && isGoogleStale(google.syncedAt));

  return { refresh: () => run(true), refreshing: isPending, error };
}
