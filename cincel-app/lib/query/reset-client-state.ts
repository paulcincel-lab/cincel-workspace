import type { QueryClient } from "@tanstack/react-query";

/**
 * Client state reset on an identity change (plan §4.8 rule 1): logout, or a
 * session whose user id or capabilities differ from the previous one. The
 * query cache holds the previous viewer's data and the UI stores their
 * drafts and selections; neither may survive into the next session.
 *
 * UI stores register their `reset()` once, at module load:
 *
 *   registerUiStoreReset(() => useShellUi.setState(SHELL_UI_INITIAL));
 */
const uiStoreResets = new Set<() => void>();

/** Registers a UI store's reset. Returns a function that unregisters it. */
export function registerUiStoreReset(reset: () => void): () => void {
  uiStoreResets.add(reset);
  return () => {
    uiStoreResets.delete(reset);
  };
}

/** Runs every registered UI store reset (also used by the test setup between tests). */
export function resetUiStores(): void {
  for (const reset of [...uiStoreResets]) reset();
}

/** Empties the query cache and resets every UI store. */
export function resetClientState(queryClient: QueryClient | null | undefined): void {
  queryClient?.clear();
  resetUiStores();
}

/**
 * The browser's `QueryClient`, set by `QueryProvider` when it mounts, so code
 * outside React (the session store subscription) can clear it. Null on the
 * server and before the provider mounts.
 */
let browserQueryClient: QueryClient | null = null;

export function setBrowserQueryClient(queryClient: QueryClient | null): void {
  browserQueryClient = queryClient;
}

export function getBrowserQueryClient(): QueryClient | null {
  return browserQueryClient;
}
