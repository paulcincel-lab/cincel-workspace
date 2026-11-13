// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";

import { INICIO_KPI } from "@/lib/dashboard/inicio";
import { dashboardStorageKey } from "@/lib/stores/dashboard-store";

import {
  INICIO_KPI_KEYS,
  INICIO_WIDGETS,
  isInicioKpiKey,
  PACE_VIEW,
  ETAPA_VIEW,
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

  it("persists only the range, collapsed, views, hidden series and filters", () => {
    const state = useInicioDashboard.getState();
    state.toggleKpi("bloqueadas");
    state.setRange("4w");
    state.toggleCollapsed("attention");
    state.setWidgetView("visual", "weeklyPace", "table");
    state.toggleSeries("weeklyPace", "created");
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as { state: Record<string, unknown> };
    expect(Object.keys(stored.state).sort()).toEqual(["collapsed", "filters", "hiddenSeries", "range", "views"]);
    expect(stored.state).toEqual({
      range: "4w",
      collapsed: { attention: true },
      views: { visual: { weeklyPace: "table" } },
      hiddenSeries: { weeklyPace: ["created"] },
      filters: { responsable: null, etapa: null },
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

  it("filters persist and rehydrate", async () => {
    const state = useInicioDashboard.getState();
    expect(state.filters).toEqual({ responsable: null, etapa: null });
    state.setFilter("responsable", "s-2");
    state.setFilter("etapa", "diseno");
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as { state: Record<string, unknown> };
    expect(stored.state.filters).toEqual({ responsable: "s-2", etapa: "diseno" });

    useInicioDashboard.getState().reset();
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: null, etapa: null });
    localStorage.setItem(KEY, JSON.stringify({ state: stored.state, version: 1 }));
    await useInicioDashboard.persist.rehydrate();
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: "s-2", etapa: "diseno" });

    useInicioDashboard.getState().clearFilters();
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: null, etapa: null });
  });

  it("reads the choices saved under the old names (tramoDonut, filter tramo)", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          range: "8w",
          collapsed: { tramoDonut: true },
          views: { visual: { tramoDonut: "table" } },
          hiddenSeries: {},
          filters: { responsable: "s-3", tramo: "diseno" },
        },
        version: 1,
      }),
    );
    await useInicioDashboard.persist.rehydrate();
    const s = useInicioDashboard.getState();
    expect(s.collapsed).toEqual({ etapaDonut: true });
    expect(s.views).toEqual({ visual: { etapaDonut: "table" } });
    expect(s.filters).toEqual({ responsable: "s-3", etapa: "diseno" });
  });

  it("reads a saved sin-tramo filter value as sin-etapa", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: { range: "8w", collapsed: {}, views: {}, hiddenSeries: {}, filters: { responsable: null, tramo: "sin-tramo" } },
        version: 1,
      }),
    );
    await useInicioDashboard.persist.rehydrate();
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: null, etapa: "sin-etapa" });
  });

  it("unknown keys dropped", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          range: "8w",
          collapsed: {},
          views: {},
          hiddenSeries: {},
          filters: { responsable: "s-3", etapa: 4, otro: "x" },
        },
        version: 1,
      }),
    );
    await useInicioDashboard.persist.rehydrate();
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: "s-3", etapa: null });
    // A key the instance does not declare is ignored.
    (useInicioDashboard.getState().setFilter as (key: string, value: string | null) => void)("otro", "y");
    expect(useInicioDashboard.getState().filters).toEqual({ responsable: "s-3", etapa: null });
  });

  it("keeps the per-style fallbacks equal to today's rendering", () => {
    for (const fallback of [ETAPA_VIEW, PACE_VIEW, WORKLOAD_VIEW]) {
      expect(fallback).toEqual({ visual: "chart", esencial: "chart", analitico: "table" });
    }
    expect(INICIO_WIDGETS).toContain("weeklyPace");
  });
});
