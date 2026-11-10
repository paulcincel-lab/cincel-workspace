// @vitest-environment node
/**
 * `useTareasUi` (zustand.md §2.4): the collapsed Analítico groups and the
 * reset (store action, `resetTareasUi` and the identity-change reset).
 */
import { describe, expect, it } from "vitest";

import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { TAREAS_UI_INITIAL, resetTareasUi, useTareasUi } from "@/lib/stores/tareas-ui-store";

const state = () => useTareasUi.getState();

describe("useTareasUi", () => {
  it("starts with every Analítico group expanded", () => {
    expect(TAREAS_UI_INITIAL).toEqual({ analitico: { collapsed: [] } });
  });

  it("remembers the collapsed Analítico groups until a reset", () => {
    state().setAnaliticoCollapsed(["p:1", "t:1:none"]);
    expect(state().analitico.collapsed).toEqual(["p:1", "t:1:none"]);
    resetTareasUi();
    expect(state().analitico.collapsed).toEqual([]);
  });

  it("reset and resetClientState go back to the initial state", () => {
    state().setAnaliticoCollapsed(["p:1"]);
    state().reset();
    expect(state().analitico).toEqual(TAREAS_UI_INITIAL.analitico);

    state().setAnaliticoCollapsed(["p:2"]);
    resetClientState(createTestQueryClient());
    expect(state().analitico.collapsed).toEqual([]);
  });
});
