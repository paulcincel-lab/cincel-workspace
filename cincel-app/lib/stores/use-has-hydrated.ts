"use client";

import { useSyncExternalStore } from "react";

/** The `persist` API a persisted Zustand store exposes (`store.persist`). */
type PersistApi = {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
  onHydrate?: (listener: () => void) => () => void;
};

/**
 * True once a persisted Zustand store has read its storage. Render the
 * server-equal default until then, so the first client render matches the
 * server HTML (zustand.md §3 SSR). Always false on the server.
 *
 *   const hydrated = useHasHydrated(useDashboardStore);
 */
export function useHasHydrated(store: { persist: PersistApi }): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const offFinish = store.persist.onFinishHydration(onChange);
      // A rehydrate() call flips hasHydrated() back to false first.
      const offStart = store.persist.onHydrate?.(onChange);
      return () => {
        offFinish();
        offStart?.();
      };
    },
    () => store.persist.hasHydrated(),
    () => false,
  );
}
