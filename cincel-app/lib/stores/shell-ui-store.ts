"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { registerUiStoreReset } from "@/lib/query/reset-client-state";
import { registerPersistedStore } from "@/components/shell/UiStoresHydrator";

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
 * - The sidebar "Proyectos" submenu (`projectsOpen`, `inactiveProjectsOpen`) is
 *   remembered in the browser under `cincel.ui.shell.v1`; the palette state is
 *   not persisted. `skipHydration`: `<UiStoresHydrator/>` rehydrates after mount.
 * - Reset on an identity change (logout) and between tests.
 */
export type ShellUiState = {
  searchOpen: boolean;
  /** True while a `CommandPalette` is mounted. */
  searchAvailable: boolean;
  /** The sidebar "Proyectos" submenu is expanded. */
  projectsOpen: boolean;
  /** Its "Pausados y cerrados" sub-group is expanded. */
  inactiveProjectsOpen: boolean;
  setProjectsOpen(open: boolean): void;
  setInactiveProjectsOpen(open: boolean): void;
  openSearch(): void;
  closeSearch(): void;
  setSearchOpen(open: boolean): void;
  toggleSearch(): void;
  setSearchAvailable(available: boolean): void;
};

export const SHELL_UI_INITIAL: Pick<
  ShellUiState,
  "searchOpen" | "searchAvailable" | "projectsOpen" | "inactiveProjectsOpen"
> = {
  searchOpen: false,
  searchAvailable: false,
  projectsOpen: false,
  inactiveProjectsOpen: false,
};

/** localStorage key of the persisted sidebar state. */
export const SHELL_UI_STORAGE_KEY = "cincel.ui.shell.v1";

export const useShellUi = create<ShellUiState>()(
  persist(
    (set) => ({
  ...SHELL_UI_INITIAL,
  setProjectsOpen: (projectsOpen) => set({ projectsOpen }),
  setInactiveProjectsOpen: (inactiveProjectsOpen) => set({ inactiveProjectsOpen }),
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  // A palette that goes away takes its open state with it.
  setSearchAvailable: (searchAvailable) => set(searchAvailable ? { searchAvailable } : { searchAvailable, searchOpen: false }),
    }),
    {
      name: SHELL_UI_STORAGE_KEY,
      version: 1,
      // Storage failures (private mode, blocked site data) leave the state in memory only.
      storage: createJSONStorage(() => {
        try {
          return window.localStorage;
        } catch {
          return {
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined,
          };
        }
      }),
      partialize: (state) => ({
        projectsOpen: state.projectsOpen,
        inactiveProjectsOpen: state.inactiveProjectsOpen,
      }),
      // A stored value of another shape never breaks the store.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<Pick<ShellUiState, "projectsOpen" | "inactiveProjectsOpen">>;
        return {
          ...current,
          projectsOpen: saved.projectsOpen === true,
          inactiveProjectsOpen: saved.inactiveProjectsOpen === true,
        };
      },
      skipHydration: true,
    },
  ),
);

registerPersistedStore(useShellUi);

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSearchOpen = (s: ShellUiState): boolean => s.searchOpen;
export const selectProjectsOpen = (s: ShellUiState): boolean => s.projectsOpen;
export const selectInactiveProjectsOpen = (s: ShellUiState): boolean => s.inactiveProjectsOpen;
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
