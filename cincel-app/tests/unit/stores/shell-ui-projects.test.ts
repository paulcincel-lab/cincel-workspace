// @vitest-environment happy-dom
/** `useShellUi` sidebar Proyectos state: defaults, persistence and rehydration. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SHELL_UI_STORAGE_KEY, useShellUi } from "@/lib/stores/shell-ui-store";

beforeEach(() => {
  window.localStorage.clear();
  useShellUi.setState({ projectsOpen: false, inactiveProjectsOpen: false });
});
afterEach(() => window.localStorage.clear());

describe("useShellUi sidebar projects", () => {
  it("starts collapsed, with the paused group collapsed", () => {
    expect(useShellUi.getState().projectsOpen).toBe(false);
    expect(useShellUi.getState().inactiveProjectsOpen).toBe(false);
  });

  it("persists the open states only, not the palette", () => {
    useShellUi.getState().setProjectsOpen(true);
    useShellUi.getState().setInactiveProjectsOpen(true);
    useShellUi.getState().openSearch();
    const saved = JSON.parse(window.localStorage.getItem(SHELL_UI_STORAGE_KEY) ?? "{}");
    expect(saved.state).toEqual({ projectsOpen: true, inactiveProjectsOpen: true });
  });

  it("survives a reload: rehydrating restores the saved state", async () => {
    window.localStorage.setItem(
      SHELL_UI_STORAGE_KEY,
      JSON.stringify({ state: { projectsOpen: true, inactiveProjectsOpen: false }, version: 1 }),
    );
    await useShellUi.persist.rehydrate();
    expect(useShellUi.getState().projectsOpen).toBe(true);
    expect(useShellUi.getState().inactiveProjectsOpen).toBe(false);
    expect(useShellUi.getState().searchOpen).toBe(false);
  });

  it("ignores a stored value of another shape", async () => {
    window.localStorage.setItem(
      SHELL_UI_STORAGE_KEY,
      JSON.stringify({ state: { projectsOpen: "yes" }, version: 1 }),
    );
    await useShellUi.persist.rehydrate();
    expect(useShellUi.getState().projectsOpen).toBe(false);
  });
});
