"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * How many `BulkActionBar`s are on screen (#1176). The floating Chavita
 * button hides while the count is above 0, so it never covers a control of
 * the bar (Quitar selección included) at any width. One rule for every page
 * that shows a bulk bar; the bar registers itself, pages do nothing.
 */
export type BulkBarState = {
  visible: number;
  show(): void;
  hide(): void;
};

export const useBulkBar = create<BulkBarState>((set) => ({
  visible: 0,
  show: () => set((s) => ({ visible: s.visible + 1 })),
  hide: () => set((s) => ({ visible: Math.max(0, s.visible - 1) })),
}));

/** True when the Chavita button must stay hidden. */
export function assistantButtonHiddenByBulkBar(visible: number): boolean {
  return visible > 0;
}

/** Registers one visible bulk bar while `active` is true. */
export function useRegisterBulkBar(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    useBulkBar.getState().show();
    return () => useBulkBar.getState().hide();
  }, [active]);
}

export function resetBulkBar(): void {
  useBulkBar.setState({ visible: 0 });
}

registerUiStoreReset(resetBulkBar);
