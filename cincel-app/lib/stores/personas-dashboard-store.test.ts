// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import * as personasStore from "./personas-dashboard-store";

const { usePersonasDashboard } = personasStore;

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

  it("starts with no selection and nothing collapsed", () => {
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

  it("persists only widget ids and the unused views/range/series; never the selection", () => {
    const state = usePersonasDashboard.getState();
    state.toggleKpi("saturado");
    state.toggleCollapsed("availability");
    const stored = persisted();
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!).sort()).toEqual(["collapsed", "hiddenSeries", "range", "views"]);
    expect(stored!.collapsed).toEqual({ availability: true });
    expect(stored!.views).toEqual({});
    expect(JSON.stringify(stored)).not.toContain("saturado");
  });

  it("reset() clears the selection and the collapse", () => {
    const state = usePersonasDashboard.getState();
    state.toggleKpi("vacaciones");
    state.setCollapsed("availability", true);
    usePersonasDashboard.getState().reset();
    const after = usePersonasDashboard.getState();
    expect(after.selectedKpi).toBeNull();
    expect(after.collapsed).toEqual({});
  });

  it("has no per-style view fallback: the Estilo is the only layout choice", () => {
    expect(personasStore).not.toHaveProperty("PERSONAS_VIEW_FALLBACK");
  });
});
