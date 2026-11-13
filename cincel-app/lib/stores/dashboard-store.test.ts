// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetUiStores } from "@/lib/query/reset-client-state";

import {
  DASHBOARD_INITIAL,
  DASHBOARD_LOADED_WEEKS,
  DASHBOARD_RANGE_WEEKS,
  createDashboardStore,
  dashboardStorageKey,
  selectCollapsed,
  selectHiddenSeries,
  selectSeriesHidden,
  selectWidgetView,
  sliceToRange,
} from "./dashboard-store";

type TestWidget = "kpis" | "weeklyPace" | "etapaDonut";
type TestKpi = "overdue" | "blocked";

const WIDGETS: readonly TestWidget[] = ["kpis", "weeklyPace", "etapaDonut"];
const SERIES = { weeklyPace: ["created", "completed"] } as const;

/** The internal test instance (the pages create theirs in their own files). */
const useTestDashboard = createDashboardStore<TestWidget, TestKpi>("inicio", { widgets: WIDGETS, series: SERIES });

const KEY = dashboardStorageKey("inicio");

function stored(key = KEY): { state: Record<string, unknown>; version: number } | null {
  const raw = window.localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

function storeV(state: unknown, version = 1, key = KEY) {
  window.localStorage.setItem(key, JSON.stringify({ state, version }));
}

beforeEach(() => {
  useTestDashboard.getState().reset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("createDashboardStore · state and actions", () => {
  it("starts with the defaults", () => {
    const s = useTestDashboard.getState();
    expect({
      selectedKpi: s.selectedKpi,
      range: s.range,
      collapsed: s.collapsed,
      views: s.views,
      hiddenSeries: s.hiddenSeries,
    }).toEqual(DASHBOARD_INITIAL);
    expect(DASHBOARD_INITIAL.range).toBe("8w");
  });

  it("selectKpi sets and clears the selected KPI", () => {
    useTestDashboard.getState().selectKpi("overdue");
    expect(useTestDashboard.getState().selectedKpi).toBe("overdue");
    useTestDashboard.getState().selectKpi(null);
    expect(useTestDashboard.getState().selectedKpi).toBeNull();
  });

  it("toggleKpi twice → null; another key switches", () => {
    const { toggleKpi } = useTestDashboard.getState();
    toggleKpi("overdue");
    expect(useTestDashboard.getState().selectedKpi).toBe("overdue");
    toggleKpi("blocked");
    expect(useTestDashboard.getState().selectedKpi).toBe("blocked");
    toggleKpi("blocked");
    expect(useTestDashboard.getState().selectedKpi).toBeNull();
  });

  it("setRange accepts 4w / 8w / 12w and ignores anything else", () => {
    useTestDashboard.getState().setRange("4w");
    expect(useTestDashboard.getState().range).toBe("4w");
    useTestDashboard.getState().setRange("12w");
    expect(useTestDashboard.getState().range).toBe("12w");
    useTestDashboard.getState().setRange("52w" as never);
    expect(useTestDashboard.getState().range).toBe("12w");
  });

  it("toggleCollapsed and setCollapsed", () => {
    useTestDashboard.getState().toggleCollapsed("weeklyPace");
    expect(selectCollapsed<TestWidget>("weeklyPace")(useTestDashboard.getState())).toBe(true);
    useTestDashboard.getState().toggleCollapsed("weeklyPace");
    expect(selectCollapsed<TestWidget>("weeklyPace")(useTestDashboard.getState())).toBe(false);
    useTestDashboard.getState().setCollapsed("etapaDonut", true);
    expect(useTestDashboard.getState().collapsed).toEqual({ weeklyPace: false, etapaDonut: true });
    expect(selectCollapsed<TestWidget>("kpis")(useTestDashboard.getState())).toBe(false);
  });

  it("setWidgetView keeps one override per style: a Visual pick does not leak into Esencial or Analítico", () => {
    const fallback = { visual: "chart", esencial: "chart", analitico: "table" } as const;
    useTestDashboard.getState().setWidgetView("visual", "etapaDonut", "table");
    const s = useTestDashboard.getState();
    expect(s.views).toEqual({ visual: { etapaDonut: "table" } });
    expect(selectWidgetView<TestWidget>("visual", "etapaDonut", fallback)(s)).toBe("table");
    expect(selectWidgetView<TestWidget>("esencial", "etapaDonut", fallback)(s)).toBe("chart");
    expect(selectWidgetView<TestWidget>("analitico", "etapaDonut", fallback)(s)).toBe("table");
    expect(selectWidgetView<TestWidget>("visual", "weeklyPace", fallback)(s)).toBe("chart");

    useTestDashboard.getState().setWidgetView("analitico", "etapaDonut", "chart");
    const t = useTestDashboard.getState();
    expect(selectWidgetView<TestWidget>("analitico", "etapaDonut", fallback)(t)).toBe("chart");
    expect(selectWidgetView<TestWidget>("visual", "etapaDonut", fallback)(t)).toBe("table");
  });

  it("toggleSeries hides and shows a series", () => {
    useTestDashboard.getState().toggleSeries("weeklyPace", "created");
    expect(selectHiddenSeries<TestWidget>("weeklyPace")(useTestDashboard.getState())).toEqual(["created"]);
    expect(selectSeriesHidden<TestWidget>("weeklyPace", "created")(useTestDashboard.getState())).toBe(true);
    expect(selectSeriesHidden<TestWidget>("weeklyPace", "completed")(useTestDashboard.getState())).toBe(false);
    useTestDashboard.getState().toggleSeries("weeklyPace", "created");
    expect(useTestDashboard.getState().hiddenSeries).toEqual({});
    // A stable empty array when nothing is hidden (no re-render loop in selectors).
    expect(selectHiddenSeries<TestWidget>("weeklyPace")(useTestDashboard.getState())).toBe(
      selectHiddenSeries<TestWidget>("kpis")(useTestDashboard.getState()),
    );
  });

  it("toggleSeries never hides the last visible series (instance series or `available`)", () => {
    const { toggleSeries } = useTestDashboard.getState();
    toggleSeries("weeklyPace", "created");
    const before = useTestDashboard.getState();
    toggleSeries("weeklyPace", "completed");
    expect(useTestDashboard.getState().hiddenSeries.weeklyPace).toEqual(["created"]);
    // Ignored without a state change.
    expect(useTestDashboard.getState()).toBe(before);

    toggleSeries("etapaDonut", "a", ["a", "b"]);
    toggleSeries("etapaDonut", "b", ["a", "b"]);
    expect(useTestDashboard.getState().hiddenSeries.etapaDonut).toEqual(["a"]);
  });

  it("reset() returns every field to the defaults, selectedKpi included", () => {
    const s = useTestDashboard.getState();
    s.selectKpi("blocked");
    s.setRange("12w");
    s.setCollapsed("kpis", true);
    s.setWidgetView("esencial", "weeklyPace", "table");
    s.toggleSeries("weeklyPace", "completed");
    useTestDashboard.getState().reset();
    const r = useTestDashboard.getState();
    expect({ selectedKpi: r.selectedKpi, range: r.range, collapsed: r.collapsed, views: r.views, hiddenSeries: r.hiddenSeries }).toEqual(
      DASHBOARD_INITIAL,
    );
  });

  it("is reset with the other UI stores on an identity change (log out A, log in B → defaults)", () => {
    useTestDashboard.getState().selectKpi("overdue");
    useTestDashboard.getState().setRange("4w");
    resetUiStores();
    expect(useTestDashboard.getState().selectedKpi).toBeNull();
    expect(useTestDashboard.getState().range).toBe("8w");
    expect(stored()?.state.range).toBe("8w");
  });

  it("applies the instance defaults (range, collapsed)", () => {
    const store = createDashboardStore<TestWidget, TestKpi>("personas", { range: "12w", collapsed: { kpis: true } });
    expect(store.getState().range).toBe("12w");
    expect(store.getState().collapsed).toEqual({ kpis: true });
    store.getState().setRange("4w");
    store.getState().reset();
    expect(store.getState().range).toBe("12w");
  });

  it("two instances never share state or storage keys", () => {
    const proyectos = createDashboardStore<TestWidget, TestKpi>("proyectos");
    const personas = createDashboardStore<TestWidget, TestKpi>("personas");
    proyectos.getState().setRange("4w");
    expect(personas.getState().range).toBe("8w");
    expect(proyectos.persist.getOptions().name).toBe("cincel.ui.dashboard.proyectos.v1");
    expect(personas.persist.getOptions().name).toBe("cincel.ui.dashboard.personas.v1");
    expect(stored(dashboardStorageKey("proyectos"))?.state.range).toBe("4w");
    expect(stored(dashboardStorageKey("personas"))).toBeNull();
  });
});

describe("createDashboardStore · persistence", () => {
  it("uses key cincel.ui.dashboard.<id>.v1, version 1 and skipHydration", () => {
    const options = useTestDashboard.persist.getOptions();
    expect(options.name).toBe("cincel.ui.dashboard.inicio.v1");
    expect(options.version).toBe(1);
    expect(options.skipHydration).toBe(true);
  });

  it("persists exactly range, collapsed, views and hiddenSeries (no selectedKpi, no actions)", () => {
    useTestDashboard.getState().selectKpi("overdue");
    useTestDashboard.getState().setRange("4w");
    const value = stored();
    expect(value?.version).toBe(1);
    expect(Object.keys(value?.state ?? {}).sort()).toEqual(["collapsed", "hiddenSeries", "range", "views"]);
    expect(JSON.stringify(value)).not.toContain("overdue");
  });

  it("does not read storage before rehydrate (the first render uses the defaults)", () => {
    storeV({ range: "12w", collapsed: { kpis: true }, views: {}, hiddenSeries: {} });
    expect(useTestDashboard.getState().range).toBe("8w");
    expect(useTestDashboard.getState().collapsed).toEqual({});
  });

  it("rehydrate() reads a stored v1 value", async () => {
    storeV({
      range: "12w",
      collapsed: { weeklyPace: true },
      views: { visual: { etapaDonut: "table" } },
      hiddenSeries: { weeklyPace: ["created"] },
    });
    await useTestDashboard.persist.rehydrate();
    const s = useTestDashboard.getState();
    expect(s.range).toBe("12w");
    expect(s.collapsed).toEqual({ weeklyPace: true });
    expect(s.views).toEqual({ visual: { etapaDonut: "table" } });
    expect(s.hiddenSeries).toEqual({ weeklyPace: ["created"] });
    expect(s.selectedKpi).toBeNull();
    expect(useTestDashboard.persist.hasHydrated()).toBe(true);
  });

  it("drops unknown widget ids, styles, views and ranges on rehydrate", async () => {
    storeV({
      range: "52w",
      collapsed: { weeklyPace: true, removedWidget: true, kpis: "yes" },
      views: { visual: { etapaDonut: "pie", weeklyPace: "table", gone: "chart" }, compacto: { kpis: "table" } },
      hiddenSeries: { weeklyPace: ["created", 3], gone: ["x"], etapaDonut: "a" },
      selectedKpi: "overdue",
    });
    await useTestDashboard.persist.rehydrate();
    const s = useTestDashboard.getState();
    expect(s.range).toBe("8w");
    expect(s.collapsed).toEqual({ weeklyPace: true });
    expect(s.views).toEqual({ visual: { weeklyPace: "table" } });
    expect(s.hiddenSeries).toEqual({ weeklyPace: ["created"] });
    expect(s.selectedKpi).toBeNull();
  });

  it("drops a stored value that hides every series of a widget", async () => {
    storeV({ range: "8w", collapsed: {}, views: {}, hiddenSeries: { weeklyPace: ["created", "completed"] } });
    await useTestDashboard.persist.rehydrate();
    expect(useTestDashboard.getState().hiddenSeries).toEqual({});
  });

  it("migrate from version 0 returns the defaults without throwing", async () => {
    storeV({ range: "12w", collapsed: { kpis: true } }, 0);
    await useTestDashboard.persist.rehydrate();
    expect(useTestDashboard.getState().range).toBe("8w");
    expect(useTestDashboard.getState().collapsed).toEqual({});
    expect(useTestDashboard.persist.hasHydrated()).toBe(true);
    // The migrated value is written back as v1.
    expect(stored()?.version).toBe(1);
    expect(stored()?.state.range).toBe("8w");
  });

  it("garbage JSON returns the defaults without throwing and is dropped", async () => {
    window.localStorage.setItem(KEY, "{not json");
    await useTestDashboard.persist.rehydrate();
    expect(useTestDashboard.getState().range).toBe("8w");
    expect(useTestDashboard.persist.hasHydrated()).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();

    window.localStorage.setItem(KEY, JSON.stringify({ state: 5, version: 1 }));
    await useTestDashboard.persist.rehydrate();
    expect(useTestDashboard.getState().range).toBe("8w");

    window.localStorage.setItem(KEY, JSON.stringify("x"));
    await useTestDashboard.persist.rehydrate();
    expect(useTestDashboard.getState().range).toBe("8w");
  });

  it("localStorage throwing (private mode) leaves the defaults and does not crash", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    await useTestDashboard.persist.rehydrate();
    expect(useTestDashboard.getState().range).toBe("8w");
    expect(() => useTestDashboard.getState().setRange("4w")).not.toThrow();
    expect(useTestDashboard.getState().range).toBe("4w");
  });
});

describe("sliceToRange", () => {
  const loaded = Array.from({ length: DASHBOARD_LOADED_WEEKS }, (_, i) => i + 1);

  it("returns the last 4 / 8 / 12 items", () => {
    expect(sliceToRange(loaded, "4w")).toEqual([9, 10, 11, 12]);
    expect(sliceToRange(loaded, "8w")).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(sliceToRange(loaded, "12w")).toEqual(loaded);
    for (const range of Object.keys(DASHBOARD_RANGE_WEEKS) as (keyof typeof DASHBOARD_RANGE_WEEKS)[]) {
      expect(sliceToRange(loaded, range)).toHaveLength(DASHBOARD_RANGE_WEEKS[range]);
    }
  });

  it("never returns more than loaded and does not mutate the input", () => {
    const short = [1, 2, 3];
    expect(sliceToRange(short, "8w")).toEqual([1, 2, 3]);
    expect(sliceToRange([], "12w")).toEqual([]);
    expect(short).toEqual([1, 2, 3]);
  });
});
