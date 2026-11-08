"use client";

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import {
  RECENT_DOCS_LIMIT,
  RECENT_DOCS_STORAGE_KEY,
  normalizeRecentDocuments,
  withRecentDocument,
  type RecentDocument,
  type RecentDocumentInput,
} from "@/components/recursos/resources-model";
import { registerUiStoreReset } from "@/lib/query/reset-client-state";

export type { RecentDocument, RecentDocumentInput } from "@/components/recursos/resources-model";

/**
 * `useRecentDocs` (zustand.md §2.7): the "Abiertos recientemente" list of the
 * Biblioteca. Replaces `use-recent-documents.ts` and its custom window event.
 *
 * - Writers: `DocumentReader` (each part opened) and `BibliotecaSection`
 *   (each document opened). Reader: `BibliotecaIndex`.
 * - Persisted under the legacy key `cincel.resources.recent-docs.v1` in the
 *   legacy **bare-array** shape (a custom storage adapter maps zustand's
 *   `{ state, version }` onto it), so existing entries keep showing.
 * - `skipHydration`: the first render uses the empty list (server HTML equals
 *   the first client render); `<UiStoresHydrator/>` rehydrates after mount.
 * - Other tabs: a `storage` listener rehydrates when the key changes.
 */
export type RecentDocsState = {
  /** Newest first, at most `RECENT_DOCS_LIMIT`. */
  docs: RecentDocument[];
  remember(doc: RecentDocumentInput, opts?: { href?: string }): void;
  clear(): void;
};

export const RECENT_DOCS_INITIAL: Pick<RecentDocsState, "docs"> = { docs: [] };

type PersistedRecentDocs = Pick<RecentDocsState, "docs">;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads and writes the legacy bare array. A value zustand wrapped
 * (`{ state: { docs }, version }`) reads too; an unreadable value is dropped.
 * Storage failures (private mode, quota) are ignored.
 */
export const recentDocsStorage: PersistStorage<PersistedRecentDocs> = {
  getItem(name): StorageValue<PersistedRecentDocs> | null {
    const store = storage();
    let raw: string | null = null;
    try {
      raw = store?.getItem(name) ?? null;
    } catch {
      return null;
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        store?.removeItem(name);
      } catch {
        // Nothing to clean up.
      }
      return null;
    }
    const wrapped = (parsed as { state?: { docs?: unknown } } | null)?.state?.docs;
    const list = Array.isArray(parsed) ? parsed : wrapped;
    return { state: { docs: normalizeRecentDocuments(list) }, version: 0 };
  },
  setItem(name, value) {
    try {
      storage()?.setItem(name, JSON.stringify(value.state.docs.slice(0, RECENT_DOCS_LIMIT)));
    } catch {
      // Private mode or quota: the list lives in memory only.
    }
  },
  removeItem(name) {
    try {
      storage()?.removeItem(name);
    } catch {
      // Nothing to remove.
    }
  },
};

export const useRecentDocs = create<RecentDocsState>()(
  persist(
    (set) => ({
      ...RECENT_DOCS_INITIAL,
      remember: (doc, opts = {}) => {
        // A write before the hydrator ran must not drop the stored list (the storage is synchronous).
        if (!useRecentDocs.persist.hasHydrated()) void useRecentDocs.persist.rehydrate();
        set((state) => ({ docs: withRecentDocument(state.docs, doc, opts) }));
      },
      clear: () => set(RECENT_DOCS_INITIAL),
    }),
    {
      name: RECENT_DOCS_STORAGE_KEY,
      storage: recentDocsStorage,
      partialize: (state) => ({ docs: state.docs }),
      skipHydration: true,
    },
  ),
);

/** Back to the empty list (identity change, tests); the stored list is emptied too. */
export function resetRecentDocs(): void {
  useRecentDocs.setState(RECENT_DOCS_INITIAL);
}

registerUiStoreReset(resetRecentDocs);

// Another tab opened a document: read the list again.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === null || event.key === RECENT_DOCS_STORAGE_KEY) void useRecentDocs.persist.rehydrate();
  });
}
