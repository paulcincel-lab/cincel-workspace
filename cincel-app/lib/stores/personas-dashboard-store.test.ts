// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import { PERSONAS_VIEW_FALLBACK, usePersonasDashboard } from "./personas-dashboard-store";

const KEY = "cincel.ui.dashboard.personas.v1";

function persisted(): Record<string, unknown> | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
}

beforeEach(() => {
  usePersonasDashboard.getState().reset();
  localStorage.clear();
});

describe("usePersonasDashboard", () => {
  it("persists under cincel.ui.dashboard.personas.v1, version 1, hydrated after mount", () => {
    const options = usePersonasDashboard.persist.getOptions();
    expect(options.name).toBe(KEY);
    expect(options.version).toBe(1);
    expect(options.skipHydration).toBe(true);
  });

  it("starts with no selection, nothing collapsed and no view overrides", () => {
    const state = usePersonasDashboard.getState();
    expect(state.selectedKpi).toBeNull();
    expect(state.collapsed).toEqual({});
    expect(state.views).toEqual({});
  });

  it("toggles the availability selection; the same key again clears it", () => {
    const { toggleKpi } = usePersonasDashboard.getState();
    toggleKpi("saturado");
    expect(usePersonasDashboard.getState().selectedKpi).toBe("saturado");
    toggleKpi("libre");
    expect(usePersonasDashboard.getState().selectedKpi).toBe("libre");
    toggleKpi("libre");
    expect(usePersonasDashboard.getState().selectedKpi).toBeNull();
  });

  it("keeps view overrides per style", () => {
    usePersonasDashboard.getState().setWidgetView("visual", "team", "table");
    const { views } = usePersonasDashboard.getState();
    expect(views.visual?.team).toBe("table");
    expect(views.esencial?.team).toBeUndefined();
    expect(views.analitico?.team).toBeUndefined();
  });

  it("persists only widget ids, view names and the unused range/series; never the selection", () => {
    const state = usePersonasDashboard.getState();
    state.toggleKpi("saturado");
    state.toggleCollapsed("availability");
    state.setWidgetView("esencial", "availability", "table");
    const stored = persisted();
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!).sort()).toEqual(["collapsed", "hiddenSeries", "range", "views"]);
    expect(stored!.collapsed).toEqual({ availability: true });
    expect(stored!.views).toEqual({ esencial: { availability: "table" } });
    expect(JSON.stringify(stored)).not.toContain("saturado");
  });

  it("reset() clears the selection, the collapse and the overrides", () => {
    const state = usePersonasDashboard.getState();
    state.toggleKpi("vacaciones");
    state.setCollapsed("availability", true);
    state.setWidgetView("visual", "team", "table");
    usePersonasDashboard.getState().reset();
    const after = usePersonasDashboard.getState();
    expect(after.selectedKpi).toBeNull();
    expect(after.collapsed).toEqual({});
    expect(after.views).toEqual({});
  });

  it("falls back to today's render: Visual and Esencial charts, Analítico tables", () => {
    expect(PERSONAS_VIEW_FALLBACK).toEqual({ visual: "chart", esencial: "chart", analitico: "table" });
  });
});
