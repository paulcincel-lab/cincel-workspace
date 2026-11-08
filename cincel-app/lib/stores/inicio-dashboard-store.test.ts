// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { INICIO_KPI } from "@/lib/dashboard/inicio";
import { dashboardStorageKey } from "@/lib/stores/dashboard-store";

import {
  INICIO_KPI_KEYS,
  INICIO_WIDGETS,
  isInicioKpiKey,
  PACE_VIEW,
  TRAMO_VIEW,
  useInicioDashboard,
  WORKLOAD_VIEW,
} from "./inicio-dashboard-store";

const KEY = "cincel.ui.dashboard.inicio.v1";

describe("useInicioDashboard instance", () => {
  it("persists under the inicio key, version 1, rehydrated after mount", () => {
    expect(dashboardStorageKey("inicio")).toBe(KEY);
    const options = useInicioDashboard.persist.getOptions();
    expect(options.name).toBe(KEY);
    expect(options.version).toBe(1);
    expect(options.skipHydration).toBe(true);
  });

  it("starts on the defaults: 8 weeks, nothing collapsed, no overrides, no selection", () => {
    const state = useInicioDashboard.getState();
    expect(state.range).toBe("8w");
    expect(state.selectedKpi).toBeNull();
    expect(state.collapsed).toEqual({});
    expect(state.views).toEqual({});
    expect(state.hiddenSeries).toEqual({});
  });

  it("uses the KPI keys of lib/dashboard/inicio.ts", () => {
    expect([...INICIO_KPI_KEYS].sort()).toEqual(Object.values(INICIO_KPI).map((k) => k.key).sort());
    for (const key of INICIO_KPI_KEYS) expect(isInicioKpiKey(key)).toBe(true);
    expect(isInicioKpiKey("otra")).toBe(false);
  });

  it("toggles the selected KPI and clears it on a second toggle", () => {
    useInicioDashboard.getState().toggleKpi("vencidas");
    expect(useInicioDashboard.getState().selectedKpi).toBe("vencidas");
    useInicioDashboard.getState().toggleKpi("vencidas");
    expect(useInicioDashboard.getState().selectedKpi).toBeNull();
  });

  it("never hides both series of Ritmo semanal", () => {
    const { toggleSeries } = useInicioDashboard.getState();
    toggleSeries("weeklyPace", "created");
    toggleSeries("weeklyPace", "completed");
    expect(useInicioDashboard.getState().hiddenSeries.weeklyPace).toEqual(["created"]);
  });

  it("persists only the range, collapsed, views and hidden series", () => {
    const state = useInicioDashboard.getState();
    state.toggleKpi("bloqueadas");
    state.setRange("4w");
    state.toggleCollapsed("attention");
    state.setWidgetView("visual", "weeklyPace", "table");
    state.toggleSeries("weeklyPace", "created");
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as { state: Record<string, unknown> };
    expect(Object.keys(stored.state).sort()).toEqual(["collapsed", "hiddenSeries", "range", "views"]);
    expect(stored.state).toEqual({
      range: "4w",
      collapsed: { attention: true },
      views: { visual: { weeklyPace: "table" } },
      hiddenSeries: { weeklyPace: ["created"] },
    });
  });

  it("rehydrates a stored value and drops ids that are not Inicio widgets", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          range: "12w",
          collapsed: { myDay: true, otro: true },
          views: { analitico: { workload: "chart", otro: "table" } },
          hiddenSeries: { weeklyPace: ["completed"], otro: ["x"] },
        },
        version: 1,
      }),
    );
    await useInicioDashboard.persist.rehydrate();
    const state = useInicioDashboard.getState();
    expect(state.range).toBe("12w");
    expect(state.collapsed).toEqual({ myDay: true });
    expect(state.views).toEqual({ analitico: { workload: "chart" } });
    expect(state.hiddenSeries).toEqual({ weeklyPace: ["completed"] });
    expect(state.selectedKpi).toBeNull();
  });

  it("keeps the per-style fallbacks equal to today's rendering", () => {
    for (const fallback of [TRAMO_VIEW, PACE_VIEW, WORKLOAD_VIEW]) {
      expect(fallback).toEqual({ visual: "chart", esencial: "chart", analitico: "table" });
    }
    expect(INICIO_WIDGETS).toContain("weeklyPace");
  });
});
