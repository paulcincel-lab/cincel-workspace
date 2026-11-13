// @vitest-environment node
/**
 * `useNewTaskUi` (zustand.md §2.3): open with defaults and source, close
 * keeping the defaults for the closing dialog, and the identity-change reset
 * through `resetClientState`.
 */
import { describe, expect, it } from "vitest";

import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { NEW_TASK_UI_INITIAL, resetNewTaskUi, useNewTaskUi } from "@/lib/stores/new-task-store";

const state = () => useNewTaskUi.getState();

describe("useNewTaskUi", () => {
  it("starts closed, without defaults or source", () => {
    expect(state()).toMatchObject(NEW_TASK_UI_INITIAL);
    expect(NEW_TASK_UI_INITIAL).toEqual({ open: false, defaults: undefined, source: null });
  });

  it("openNewTask opens with the defaults and the source", () => {
    state().openNewTask({ projectId: "p-1", etapaKey: "diseno" }, "url");
    expect(state()).toMatchObject({ open: true, defaults: { projectId: "p-1", etapaKey: "diseno" }, source: "url" });
  });

  it("openNewTask without arguments opens a blank form with no source", () => {
    state().openNewTask({ title: "Vieja" }, "nota");
    state().closeNewTask();
    state().openNewTask();
    expect(state()).toMatchObject({ open: true, defaults: undefined, source: null });
  });

  it("closeNewTask closes and keeps the defaults for the closing dialog", () => {
    state().openNewTask({ status: "en_proceso" }, "tablero-quick-add");
    state().closeNewTask();
    expect(state()).toMatchObject({ open: false, defaults: { status: "en_proceso" }, source: "tablero-quick-add" });
  });

  it("resetNewTaskUi goes back to the initial state", () => {
    state().openNewTask({ projectId: "p-1" }, "proyecto");
    resetNewTaskUi();
    expect(state()).toMatchObject(NEW_TASK_UI_INITIAL);
  });

  it("is reset by resetClientState (logout / identity change)", () => {
    const client = createTestQueryClient();
    client.setQueryData(["catalog", "project-options"], [{ id: "p-1" }]);
    state().openNewTask({ projectId: "p-1" }, "inicio");

    resetClientState(client);

    expect(state()).toMatchObject(NEW_TASK_UI_INITIAL);
    expect(client.getQueryData(["catalog", "project-options"])).toBeUndefined();
  });
});
