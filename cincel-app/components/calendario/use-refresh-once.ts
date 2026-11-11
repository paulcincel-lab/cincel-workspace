"use client";

/**
 * Runs the Google refresh mutation once per session when the cache is older than
 * 5 minutes (FE §6.3, F8). It is a mutation triggered from the hydration
 * callback, never a `queryFn` and never an action call in a bare `useEffect`.
 * Body belongs to the Phase 2 issue.
 */
export function useRefreshOnce(mutation: { mutate(): void }, shouldRun: boolean): void {
  void mutation;
  void shouldRun;
}
