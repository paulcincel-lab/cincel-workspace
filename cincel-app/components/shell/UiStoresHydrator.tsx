"use client";

import { useEffect } from "react";

import { useRecentDocs } from "@/lib/stores/recent-docs-store";

/** What the hydrator needs of a persisted (`skipHydration`) Zustand store. */
export type PersistedStore = {
  persist: { rehydrate: () => Promise<void> | void };
};

/** Persisted stores registered by their factory (the dashboard stores). */
const persistedStores = new Set<PersistedStore>();
/** Stores already rehydrated, so each reads its storage once (Strict Mode runs effects twice). */
const rehydrated = new WeakSet<PersistedStore>();
/** True while a `<UiStoresHydrator/>` is mounted, i.e. the first client render is over. */
let mounted = false;

function rehydrateOnce(store: PersistedStore): void {
  if (rehydrated.has(store)) return;
  rehydrated.add(store);
  void store.persist.rehydrate();
}

/**
 * Registers a persisted store for rehydration after mount. A store created
 * before the hydrator mounted (the page's modules on the first load) is
 * rehydrated by the hydrator's effect, after the first client render; one
 * created later (a page reached by client navigation, with no server HTML to
 * match) is rehydrated at once. Each store reads its storage once.
 */
export function registerPersistedStore(store: PersistedStore): void {
  persistedStores.add(store);
  if (mounted) rehydrateOnce(store);
}

/**
 * Mount point for the persisted UI stores (zustand.md §2.1): `skipHydration`
 * stores call `persist.rehydrate()` here, after the first client render, so
 * the server HTML and the first client render agree.
 */
export function UiStoresHydrator(): null {
  useEffect(() => {
    void useRecentDocs.persist.rehydrate();
    mounted = true;
    for (const store of persistedStores) rehydrateOnce(store);
    return () => {
      mounted = false;
    };
  }, []);
  return null;
}
