"use client";

import { useEffect } from "react";

/** The cache is "stale" after this long (FE §6.3). */
export const GOOGLE_STALE_MS = 5 * 60 * 1000;

let ranThisSession = false;

/** Forgets that the refresh ran (identity change, tests). */
export function resetRefreshOnce(): void {
  ranThisSession = false;
}

/** Whether the Google events cache is older than 5 minutes (or has never synced). */
export function isGoogleStale(syncedAt: string | null, now: number = Date.now()): boolean {
  if (!syncedAt) return true;
  const at = Date.parse(syncedAt);
  return Number.isNaN(at) || now - at > GOOGLE_STALE_MS;
}

/**
 * Runs the Google refresh mutation once per session when the cache is older than
 * 5 minutes (FE §6.3, F8). It is a mutation triggered after mount, never a
 * `queryFn` and never an action call in an effect: the effect only calls
 * `mutation.mutate()` and only the first time `shouldRun` is true.
 */
export function useRefreshOnce(mutation: { mutate(): void }, shouldRun: boolean): void {
  useEffect(() => {
    if (!shouldRun || ranThisSession) return;
    ranThisSession = true;
    mutation.mutate();
    // `mutation.mutate` is stable; the session flag guards re-runs.
  }, [shouldRun, mutation]);
}
