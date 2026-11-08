// @vitest-environment happy-dom
/**
 * `useProyectosDashboard` (zustand.md §2.5, issue #969): the instance's
 * storage key and defaults, the tramo toggle, per-style view overrides, what
 * is persisted (never the tramo selection), rehydration and the logout reset.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { NO_TRAMO_KEY } from "@/components/proyectos/projects-portfolio-data";
import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";

import {
  PROYECTOS_DASHBOARD_INITIAL,
  PROYECTOS_VIEW_FALLBACK,
  resetProyectosDashboard,
  selectSelectedTramo,
  selectTramoStripCollapsed,
  useProyectosDashboard,
} from "./proyectos-dashboard-store";

const KEY = "cincel.ui.dashboard.proyectos.v1";
const state = () => useProyectosDashboard.getState();

function persisted(): Record<string, unknown> | null {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { state: Record<string, unknown> }).state : null;
}

beforeEach(() => {
  resetProyectosDashboard();
  localStorage.clear();
});

describe("useProyectosDashboard", () => {
  it("persists under cincel.ui.dashboard.proyectos.v1, version 1, hydrated after mount", () => {
    const options = useProyectosDashboard.persist.getOptions();
    expect(options.name).toBe(KEY);
    expect(options.version).toBe(1);
    expect(options.skipHydration).toBe(true);
  });

  it("starts with no tramo selected, nothing collapsed and no view overrides", () => {
    expect(PROYECTOS_DASHBOARD_INITIAL).toMatchObject({
      selectedKpi: null,
      range: "8w",
      collapsed: {},
      views: {},
      hiddenSeries: {},
    });
    expect(selectSelectedTramo(state())).toBeNull();
    expect(selectTramoStripCollapsed(state())).toBe(false);
  });

  it("falls back to today's render per style: strip and list/table, cards and table", () => {
    expect(PROYECTOS_VIEW_FALLBACK.tramoStrip).toEqual({ visual: "chart", esencial: "chart", analitico: "table" });
    expect(PROYECTOS_VIEW_FALLBACK.portfolio).toEqual({ visual: "chart", esencial: "chart", analitico: "table" });
  });

  it("toggles the tramo; the same key again clears it, Sin tramo included", () => {
    state().toggleKpi("diseno");
    expect(selectSelectedTramo(state())).toBe("diseno");
    state().toggleKpi(NO_TRAMO_KEY);
    expect(selectSelectedTramo(state())).toBe(NO_TRAMO_KEY);
    state().toggleKpi(NO_TRAMO_KEY);
    expect(selectSelectedTramo(state())).toBeNull();
  });

  it("keeps view overrides per style", () => {
    state().setWidgetView("visual", "portfolio", "table");
    state().setWidgetView("analitico", "tramoStrip", "chart");
    const { views } = state();
    expect(views.visual).toEqual({ portfolio: "table" });
    expect(views.analitico).toEqual({ tramoStrip: "chart" });
    expect(views.esencial).toBeUndefined();
  });

  it("persists only widget ids, view names and the unused range/series; never the tramo", () => {
    state().toggleKpi("presale");
    state().toggleCollapsed("tramoStrip");
    state().setWidgetView("esencial", "portfolio", "table");
    const stored = persisted();
    expect(stored).not.toBeNull();
    expect(Object.keys(stored!).sort()).toEqual(["collapsed", "hiddenSeries", "range", "views"]);
    expect(stored!.collapsed).toEqual({ tramoStrip: true });
    expect(stored!.views).toEqual({ esencial: { portfolio: "table" } });
    expect(JSON.stringify(stored)).not.toContain("presale");
  });

  it("rehydrates collapsed and views (dropping unknown widgets) but never a tramo", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          selectedKpi: "diseno",
          range: "8w",
          collapsed: { tramoStrip: true, weeklyPace: true },
          views: { visual: { portfolio: "table", other: "table" } },
          hiddenSeries: {},
        },
        version: 1,
      }),
    );
    await useProyectosDashboard.persist.rehydrate();
    expect(selectTramoStripCollapsed(state())).toBe(true);
    expect(state().collapsed).toEqual({ tramoStrip: true });
    expect(state().views).toEqual({ visual: { portfolio: "table" } });
    expect(selectSelectedTramo(state())).toBeNull();
  });

  it("goes back to the defaults on reset and on logout (resetClientState)", () => {
    state().toggleKpi("diseno");
    state().toggleCollapsed("tramoStrip");
    resetProyectosDashboard();
    expect(selectSelectedTramo(state())).toBeNull();
    expect(selectTramoStripCollapsed(state())).toBe(false);

    state().toggleKpi("diseno");
    state().setWidgetView("visual", "portfolio", "table");
    resetClientState(createTestQueryClient());
    expect(selectSelectedTramo(state())).toBeNull();
    expect(state().views).toEqual({});
  });
});
