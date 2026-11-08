// @vitest-environment node
/**
 * `useShellUi` (zustand.md §2.1): the ⌘K palette's open state and whether a
 * palette is mounted, shared by ⌘K, the Sidebar button and the 404 button,
 * and the identity-change reset through `resetClientState`.
 */
import { describe, expect, it } from "vitest";

import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import {
  openCommandPalette,
  resetShellUi,
  selectSearchAvailable,
  selectSearchOpen,
  SHELL_UI_INITIAL,
  useShellUi,
} from "@/lib/stores/shell-ui-store";

const state = () => useShellUi.getState();

describe("useShellUi", () => {
  it("starts closed with no palette mounted", () => {
    expect(state()).toMatchObject(SHELL_UI_INITIAL);
    expect(selectSearchOpen(state())).toBe(false);
    expect(selectSearchAvailable(state())).toBe(false);
  });

  it("openSearch / closeSearch / setSearchOpen", () => {
    state().openSearch();
    expect(state().searchOpen).toBe(true);
    state().closeSearch();
    expect(state().searchOpen).toBe(false);
    state().setSearchOpen(true);
    expect(state().searchOpen).toBe(true);
    state().setSearchOpen(false);
    expect(state().searchOpen).toBe(false);
  });

  it("toggleSearch flips the open state (⌘K)", () => {
    state().toggleSearch();
    expect(state().searchOpen).toBe(true);
    state().toggleSearch();
    expect(state().searchOpen).toBe(false);
  });

  it("setSearchAvailable(false) also closes the palette", () => {
    state().setSearchAvailable(true);
    state().openSearch();
    expect(state()).toMatchObject({ searchAvailable: true, searchOpen: true });
    state().setSearchAvailable(false);
    expect(state()).toMatchObject({ searchAvailable: false, searchOpen: false });
  });

  it("openCommandPalette() opens it from code outside React", () => {
    openCommandPalette();
    expect(state().searchOpen).toBe(true);
  });

  it("keeps the actions stable across updates", () => {
    const { openSearch, toggleSearch } = state();
    state().openSearch();
    expect(state().openSearch).toBe(openSearch);
    expect(state().toggleSearch).toBe(toggleSearch);
  });

  it("resetShellUi goes back to the initial state", () => {
    state().setSearchAvailable(true);
    state().openSearch();
    resetShellUi();
    expect(state()).toMatchObject(SHELL_UI_INITIAL);
  });

  it("an identity change (resetClientState) resets it", () => {
    state().setSearchAvailable(true);
    state().openSearch();
    resetClientState(createTestQueryClient());
    expect(state()).toMatchObject(SHELL_UI_INITIAL);
  });
});
