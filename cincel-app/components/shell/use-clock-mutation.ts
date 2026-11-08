"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { clockInAction, clockOutAction, pauseWorkAction, resumeWorkAction } from "@/lib/actions/time-tracking-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import type { ActionResult } from "@/lib/types/schedule";
import type { TimeEntrySource, TodayStatus } from "@/lib/types/redesign";

/**
 * The clock writes of the shell (`TimeClock`, `ClockInPrompt`,
 * `CommandPalette`), one mutation for the four actions (plan §4.3 Shell,
 * Phase 2 invalidations):
 *
 * - success: the returned `TodayStatus` goes into `qk.me.today()` with
 *   `setQueryData`, so every clock surface updates at once without a server
 *   render; `me.weekHours`, Ajustes › Horario and Personas › Equipo are
 *   invalidated (they show the hours).
 * - error: the optimistic status is rolled back and `me.today` is refetched
 *   (the server may be ahead of this tab, e.g. `ALREADY_ON`). The caller shows
 *   the error copy, so `ALREADY_ON` can stay quiet.
 *
 * The clock actions revalidate nothing, and nothing here refreshes the router.
 */
export type ClockAction = "clockIn" | "pause" | "resume" | "clockOut";

export type ClockMutationOptions = {
  /** `time_entries.source` of a clock-in. */
  source: TimeEntrySource;
  /** Show the next state at once (the sidebar clock), rolled back on error. */
  optimistic?: boolean;
};

/** What the hours views read; refreshed after every clock write. */
export const CLOCK_INVALIDATIONS: readonly QueryKey[] = [
  qk.me.weekHours(),
  qk.ajustes.page("horario"),
  qk.personas.equipo(),
];

function callClockAction(action: ClockAction, source: TimeEntrySource): Promise<ActionResult<TodayStatus>> {
  switch (action) {
    case "clockIn":
      return clockInAction({ source });
    case "pause":
      return pauseWorkAction();
    case "resume":
      return resumeWorkAction();
    case "clockOut":
      return clockOutAction();
  }
}

/**
 * Seconds worked as of `now`: the synced `workedSeconds` plus, while the day is
 * running, the stretch since the later of the sync and `startedAt`.
 */
export function workedSecondsAt(snapshot: { status: TodayStatus; syncedAt: number }, now: number): number {
  const { status, syncedAt } = snapshot;
  if (status.state !== "on") return status.workedSeconds;
  const started = status.startedAt ? Date.parse(status.startedAt) : Number.NaN;
  const anchor = Number.isFinite(started) ? Math.max(syncedAt, started) : syncedAt;
  return status.workedSeconds + Math.max(0, Math.floor((now - anchor) / 1000));
}

/** The status an action leads to, shown before the server answers. */
export function optimisticStatus(action: ClockAction, previous: TodayStatus, syncedAt: number, at: number): TodayStatus {
  const workedSeconds = workedSecondsAt({ status: previous, syncedAt }, at);
  switch (action) {
    case "clockIn":
      return { ...previous, state: "on", startedAt: new Date(at).toISOString(), workedSeconds };
    case "pause":
      return { ...previous, state: "pausa", workedSeconds };
    case "resume":
      return { ...previous, state: "on", workedSeconds };
    case "clockOut":
      return { ...previous, state: "done", workedSeconds };
  }
}

type Snapshot = { previous: TodayStatus | undefined };

async function applyOptimistic(qc: QueryClient, action: ClockAction): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: qk.me.today() });
  const state = qc.getQueryState<TodayStatus>(qk.me.today());
  const previous = state?.data;
  if (previous) {
    const at = Date.now();
    qc.setQueryData<TodayStatus>(qk.me.today(), optimisticStatus(action, previous, state.dataUpdatedAt || at, at));
  }
  return { previous };
}

/** On error: back to the status before the click, then re-read the day (not awaited, so the error copy shows at once). */
function rollback(qc: QueryClient, snap: Snapshot): void {
  if (snap.previous) qc.setQueryData(qk.me.today(), snap.previous);
  void qc.invalidateQueries({ queryKey: qk.me.today() });
}

export function useClockMutation({ source, optimistic = false }: ClockMutationOptions) {
  return useActionMutation<ClockAction, TodayStatus, Snapshot>((action) => callClockAction(action, source), {
    setData: (qc, status) => qc.setQueryData(qk.me.today(), status),
    invalidate: CLOCK_INVALIDATIONS,
    optimistic: {
      onMutate: optimistic ? applyOptimistic : () => ({ previous: undefined }),
      rollback,
    },
    // The caller shows the error copy (ALREADY_ON stays quiet).
    onFormError: () => undefined,
  });
}
