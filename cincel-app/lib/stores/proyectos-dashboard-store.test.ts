// @vitest-environment happy-dom
/**
 * `useProyectosDashboard` (zustand.md §2.5, issues #969, #992): the
 * instance's storage key (`v2`, so stale per-widget views are dropped) and
 * defaults, the tramo toggle, what is persisted (never the tramo selection),
 * rehydration and the logout reset.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { NO_TRAMO_KEY } from "@/components/proyectos/projects-portfolio-data";
import { resetClientState } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";

import * as storeModule from "./proyectos-dashboard-store";
import {
  PROYECTOS_DASHBOARD_INITIAL,
  resetProyectosDashboard,
  selectSelectedTramo,
  selectTramoStripCollapsed,
  useProyectosDashboard,
} from "./proyectos-dashboard-store";

const KEY = "cincel.ui.dashboard.proyectos.v2";
const OLD_KEY = "cincel.ui.dashboard.proyectos.v1";
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
  it("persists under cincel.ui.dashboard.proyectos.v2, hydrated after mount", () => {
    const options = useProyectosDashboard.persist.getOptions();
    expect(options.name).toBe(KEY);
    expect(options.version).toBe(1);
    expect(options.skipHydration).toBe(true);
  });

  it("no longer exports per-style view helpers", () => {
    expect("useProyectosWidgetView" in storeModule).toBe(false);
    expect("PROYECTOS_VIEW_FALLBACK" in storeModule).toBe(false);
  });

  it("starts with no etapa selected and nothing collapsed", () => {
    expect(PROYECTOS_DASHBOARD_INITIAL).toMatchObject({ selectedKpi: null, collapsed: {} });
    expect(selectSelectedTramo(state())).toBeNull();
    expect(selectTramoStripCollapsed(state())).toBe(false);
  });

  it("toggles the etapa; the same key again clears it, Sin etapa included", () => {
    state().toggleKpi("diseno");
    expect(selectSelectedTramo(state())).toBe("diseno");
    state().toggleKpi(NO_TRAMO_KEY);
    expect(selectSelectedTramo(state())).toBe(NO_TRAMO_KEY);
    state().toggleKpi(NO_TRAMO_KEY);
    expect(selectSelectedTramo(state())).toBeNull();
  });

  it("persists collapsed but never the etapa", () => {
    state().toggleKpi("presale");
    state().toggleCollapsed("tramoStrip");
    const stored = persisted();
    expect(stored).not.toBeNull();
    expect(stored!.collapsed).toEqual({ tramoStrip: true });
    expect(JSON.stringify(stored)).not.toContain("presale");
  });

  it("ignores what the v1 key stored (old per-widget views)", async () => {
    localStorage.setItem(
      OLD_KEY,
      JSON.stringify({
        state: { range: "8w", collapsed: { tramoStrip: true }, views: { visual: { portfolio: "table" } }, hiddenSeries: {} },
        version: 1,
      }),
    );
    await useProyectosDashboard.persist.rehydrate();
    expect(selectTramoStripCollapsed(state())).toBe(false);
    expect(state().views).toEqual({});
  });

  it("rehydrates collapsed from v2 (dropping unknown widgets) but never a etapa", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        state: {
          selectedKpi: "diseno",
          range: "8w",
          collapsed: { tramoStrip: true, weeklyPace: true },
          views: {},
          hiddenSeries: {},
        },
        version: 1,
      }),
    );
    await useProyectosDashboard.persist.rehydrate();
    expect(selectTramoStripCollapsed(state())).toBe(true);
    expect(state().collapsed).toEqual({ tramoStrip: true });
    expect(selectSelectedTramo(state())).toBeNull();
  });

  it("goes back to the defaults on reset and on logout (resetClientState)", () => {
    state().toggleKpi("diseno");
    state().toggleCollapsed("tramoStrip");
    resetProyectosDashboard();
    expect(selectSelectedTramo(state())).toBeNull();
    expect(selectTramoStripCollapsed(state())).toBe(false);

    state().toggleKpi("diseno");
    resetClientState(createTestQueryClient());
    expect(selectSelectedTramo(state())).toBeNull();
  });
});
