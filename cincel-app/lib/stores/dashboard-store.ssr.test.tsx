// @vitest-environment happy-dom
/**
 * SSR safety of the dashboard store factory (#967, zustand.md §3 SSR rules
 * 1 and 3): with a persisted value in localStorage, the server HTML equals
 * the first client render (defaults, no hydration warning) and the persisted
 * value applies only after mount, through `<UiStoresHydrator/>`.
 */
import { act } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UiStoresHydrator } from "@/components/shell/UiStoresHydrator";

import { createDashboardStore, dashboardStorageKey, selectCollapsed, useWidgetView } from "./dashboard-store";

type W = "weeklyPace" | "etapaDonut";
type K = "overdue";

/** Created at module load, before any hydrator mounts (like a page's instance on the first load). */
const useSsrDashboard = createDashboardStore<W, K>("proyectos", { widgets: ["weeklyPace", "etapaDonut"] });

const FALLBACK = { visual: "chart", esencial: "chart", analitico: "table" } as const;

function Dashboard() {
  const range = useSsrDashboard((s) => s.range);
  const collapsed = useSsrDashboard(selectCollapsed<W>("weeklyPace"));
  const view = useWidgetView(useSsrDashboard, "etapaDonut", FALLBACK);
  return <p data-testid="dash">{`${range}/${String(collapsed)}/${view}`}</p>;
}

function tree() {
  return (
    <>
      <UiStoresHydrator />
      <Dashboard />
    </>
  );
}

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("createDashboardStore SSR", () => {
  it("the first client render equals the server HTML; the persisted value applies after mount", async () => {
    window.localStorage.setItem(
      dashboardStorageKey("proyectos"),
      JSON.stringify({
        state: { range: "4w", collapsed: { weeklyPace: true }, views: { visual: { etapaDonut: "table" } }, hiddenSeries: {} },
        version: 1,
      }),
    );

    const html = renderToString(tree());
    expect(html).toContain("8w/false/chart");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // The client's first render, before any effect, is the defaults too.
    const firstRender = renderToString(tree());
    expect(firstRender).toBe(html);

    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recoverable = vi.fn();
    try {
      await act(async () => {
        root = hydrateRoot(container, tree(), { onRecoverableError: recoverable });
      });
      expect(recoverable).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }

    expect(useSsrDashboard.persist.hasHydrated()).toBe(true);
    expect(container.querySelector('[data-testid="dash"]')?.textContent).toBe("4w/true/table");
  });
});
