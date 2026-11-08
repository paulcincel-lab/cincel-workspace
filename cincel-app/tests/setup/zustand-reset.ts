/**
 * Zustand test foundation (zustand.md §3 Testing): after every test, every
 * registered UI store goes back to its initial state and localStorage is
 * emptied, so no store state or persisted value leaks into the next test.
 * Stores register their reset with `registerUiStoreReset` at module load.
 */
import { afterEach } from "vitest";

import { resetUiStores } from "@/lib/query/reset-client-state";

afterEach(() => {
  resetUiStores();
  try {
    globalThis.localStorage?.clear();
  } catch {
    // No storage in the node environment.
  }
});
