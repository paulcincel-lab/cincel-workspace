/**
 * Zustand test foundation (zustand.md §3 Testing): after every test, every
 * registered UI store goes back to its initial state and localStorage is
 * emptied, so no store state or persisted value leaks into the next test.
 * Stores register their reset with `registerUiStoreReset` at module load.
 */
import { afterEach } from "vitest";

import { resetUiStores } from "@/lib/query/reset-client-state";

/**
 * This hook runs before Testing Library's own cleanup, so unmount the rendered trees first: resetting a store that a
 * still-mounted component subscribes to would update it outside `act(...)`.
 */
const cleanup = typeof document !== "undefined" ? (await import("@testing-library/react")).cleanup : () => undefined;

afterEach(() => {
  cleanup();
  resetUiStores();
  try {
    globalThis.localStorage?.clear();
  } catch {
    // No storage in the node environment.
  }
});
