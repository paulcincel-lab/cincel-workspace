"use client";

import { create } from "zustand";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";

/**
 * Shell UI state (zustand.md §2.1): whether the ⌘K palette is open and
 * whether one is mounted. Replaces `AppShellClient`'s `searchOpen` state and
 * the "search" entry of the old shell-openers registry, so ⌘K, the Sidebar
 * button and the 404 "Buscar" button open the same palette.
 *
 * - Writes: `CommandPalette` (⌘K → `toggleSearch`, `onOpenChange` →
 *   `setSearchOpen`, mount/unmount → `setSearchAvailable`), the Sidebar
 *   search button and `NotFoundSearchButton` (`openSearch`), and
 *   `AppShellClient` (`closeSearch` on a pathname change).
 * - Not persisted. Reset on an identity change (logout) and between tests.
 */
export type ShellUiState = {
  searchOpen: boolean;
  /** True while a `CommandPalette` is mounted. */
  searchAvailable: boolean;
  openSearch(): void;
  closeSearch(): void;
  setSearchOpen(open: boolean): void;
  toggleSearch(): void;
  setSearchAvailable(available: boolean): void;
};

export const SHELL_UI_INITIAL: Pick<ShellUiState, "searchOpen" | "searchAvailable"> = {
  searchOpen: false,
  searchAvailable: false,
};

export const useShellUi = create<ShellUiState>((set) => ({
  ...SHELL_UI_INITIAL,
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  // A palette that goes away takes its open state with it.
  setSearchAvailable: (searchAvailable) => set(searchAvailable ? { searchAvailable } : { searchAvailable, searchOpen: false }),
}));

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSearchOpen = (s: ShellUiState): boolean => s.searchOpen;
export const selectSearchAvailable = (s: ShellUiState): boolean => s.searchAvailable;

/** Back to the initial state (identity change, tests). */
export function resetShellUi(): void {
  useShellUi.setState(SHELL_UI_INITIAL);
}

registerUiStoreReset(resetShellUi);

/** Opens the ⌘K palette from code outside React. */
export function openCommandPalette(): void {
  useShellUi.getState().openSearch();
}
