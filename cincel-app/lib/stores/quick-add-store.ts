"use client";

import { create } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * Tasks just created from a quick-add line (`QuickAddRow`), newest first, so
 * lists render their real row with `row-new` and the "Nueva" badge. Nothing
 * is persisted: the marks last until reload or an identity change.
 */
export const QUICK_ADD_RECENT_MAX = 20;

export type QuickAddRecentState = {
  recent: string[];
  markCreated(id: string): void;
  isNew(id: string): boolean;
};

export const QUICK_ADD_RECENT_INITIAL: Pick<QuickAddRecentState, "recent"> = { recent: [] };

export const useQuickAddRecent = create<QuickAddRecentState>((set, get) => ({
  ...QUICK_ADD_RECENT_INITIAL,
  markCreated: (id) => set((s) => ({ recent: [id, ...s.recent.filter((x) => x !== id)].slice(0, QUICK_ADD_RECENT_MAX) })),
  isNew: (id) => get().recent.includes(id),
}));

/** Back to the initial state (identity change, tests). */
export function resetQuickAddRecent(): void {
  useQuickAddRecent.setState(QUICK_ADD_RECENT_INITIAL);
}

registerUiStoreReset(resetQuickAddRecent);
