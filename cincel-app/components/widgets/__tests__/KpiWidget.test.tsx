// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("@/lib/tramos/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, number> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { KPI_EMPTY_STATE, KpiWidget, kpiTableData, visibleKpis, type KpiWidgetProps } from "@/components/widgets/KpiWidget";
import { kpiFixture, kpiFixtureSharedKeys, kpiFixtureValues } from "@/components/widgets/fixtures/kpi";
import type { PresentationStyle } from "@/lib/types/redesign";

function renderWidget(style: PresentationStyle, props: Partial<KpiWidgetProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <KpiWidget items={kpiFixture} {...props} />
    </StyleProvider>,
  );
}

function renderedValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-slot="kpi-value"]')).map((n) => n.textContent ?? "");
}

const sharedValues = kpiFixtureSharedKeys.map((k) => kpiFixtureValues[k]);

afterEach(() => {
  cleanup();
});

describe("KpiWidget · Visual", () => {
  it("renders tiles with value, sparkline, delta pill and split bar; only the Visual branch", () => {
    const { container } = renderWidget("visual");
    expect(container.querySelectorAll('[data-style="visual"]')).toHaveLength(1);
    expect(container.querySelector('[data-style="esencial"], [data-style="analitico"]')).toBeNull();
    expect(container.querySelector("table")).toBeNull();

    expect(container.querySelectorAll('[data-slot="kpi-tile"]')).toHaveLength(4);
    expect(renderedValues(container)).toEqual(sharedValues);
    expect(container.querySelectorAll('[data-slot="sparkline"]')).toHaveLength(4);
    expect(screen.getByRole("img", { name: /Tendencia 7 días de Proyectos activos: 9, 10, 10, 11, 11, 12, 12/ })).toBeTruthy();

    const split = screen.getByRole("img", { name: /Por tramo/ });
    expect(split.getAttribute("aria-label")).toBe("Por tramo: Presale 25 %, Diseño 33 %, Construcción 42 %");
    const segments = split.querySelectorAll("span");
    expect(segments).toHaveLength(3);
    expect(segments[0].getAttribute("style")).toContain("width: 25%");
    expect(segments[0].getAttribute("style")).toContain("var(--chart-1)");

    expect(screen.getByText("3 inician este mes")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Proyectos activos/ }).getAttribute("href")).toBe("/proyectos");
  });

  it("colors the delta pill by `good` in both directions", () => {
    const { container } = renderWidget("visual");
    const pills = Array.from(container.querySelectorAll('[data-slot="kpi-delta"]'));
    expect(pills.map((p) => [p.textContent, p.getAttribute("data-good")])).toEqual([
      ["+2", "true"],
      ["−4", "true"],
      ["+3", "false"],
    ]);
    // Up is bad for "Bloqueadas", down is good for "Vencidas".
    expect(pills[1].getAttribute("data-variant")).toBe("success");
    expect(pills[2].getAttribute("data-variant")).toBe("destructive");
  });

  it("filters `visibleIn` internally: the Analítico-only KPI is not rendered", () => {
    renderWidget("visual");
    expect(screen.queryByText("Completadas · semana")).toBeNull();
  });
});

describe("KpiWidget · Visual chip, sparkline and context line (frame Dashboard)", () => {
  const canvasItems: KpiWidgetProps["items"] = [
    {
      key: "proyectos_activos",
      label: "Proyectos activos",
      value: 6,
      delta: { value: 1, good: true, caption: "vs. semana pasada", label: "+1 este mes", tone: "good" },
      series7: [1, 1, 3, 3, 3, 5, 5],
      split: [{ tramo: "presale", share: 0.33 }],
      caption: "Por área: Presale 2 · Diseño 1 · Construcción 2 · Decoración 1",
    },
    {
      key: "vencidas",
      label: "Vencidas",
      value: 31,
      delta: { value: 4, good: false, caption: "vs. semana pasada", label: "+4 vs. semana", tone: "bad" },
      series7: [19, 22, 21, 25, 26, 28, 31],
      split: [{ tramo: "construccion", share: 0.45 }],
      caption: "Construcción concentra 14 de 31",
    },
    {
      key: "bloqueadas",
      label: "Bloqueadas",
      value: 0,
      delta: { value: 0, good: true, caption: "vs. semana pasada", label: "sin cambio", tone: "neutral" },
      series7: [0, 0, 0, 0, 0, 0, 0],
      split: [],
      caption: "Nada bloqueado hoy",
    },
    {
      key: "revisiones_7d",
      label: "Revisiones · 7 días",
      value: 0,
      // No producer label: the chip still reads "sin cambio".
      delta: { value: 0, good: true, caption: "vs. semana pasada" },
      series7: [],
      split: [],
      caption: "Próxima revisión sin agendar",
    },
  ];

  it("renders the chip text and tone; zero deltas read \"sin cambio\" in a neutral chip", () => {
    const { container } = renderWidget("visual", { items: canvasItems });
    const pills = Array.from(container.querySelectorAll('[data-slot="kpi-delta"]'));
    expect(pills.map((p) => [p.textContent, p.getAttribute("data-tone"), p.getAttribute("data-variant")])).toEqual([
      ["+1 este mes", "good", "success"],
      ["+4 vs. semana", "bad", "destructive"],
      ["sin cambio", "neutral", "outline"],
      ["sin cambio", "neutral", "outline"],
    ]);
    expect(pills.every((p) => (p.textContent ?? "").trim().length > 0)).toBe(true);
    expect(screen.queryByText("vs. semana pasada")).toBeNull();
  });

  it("never renders an empty chip, even without a producer label", () => {
    const { container } = renderWidget("visual");
    const pills = Array.from(container.querySelectorAll('[data-slot="kpi-delta"]'));
    expect(pills.length).toBeGreaterThan(0);
    expect(pills.every((p) => (p.textContent ?? "").trim().length > 0)).toBe(true);
  });

  it("renders one context line per card with the canvas copy", () => {
    const { container } = renderWidget("visual", { items: canvasItems });
    expect(Array.from(container.querySelectorAll('[data-slot="kpi-context"]')).map((n) => n.textContent)).toEqual([
      "Por área: Presale 2 · Diseño 1 · Construcción 2 · Decoración 1",
      "Construcción concentra 14 de 31",
      "Nada bloqueado hoy",
      "Próxima revisión sin agendar",
    ]);
  });

  it("draws the sparkline from the series with a tinted area, and hides it without one", () => {
    const { container } = renderWidget("visual", { items: canvasItems });
    const lines = Array.from(container.querySelectorAll('[data-slot="sparkline"]'));
    // Only the two cards with a non-zero series draw a line; none is flat.
    expect(lines).toHaveLength(2);
    expect(lines[0].getAttribute("width")).toBe("120");
    expect(lines[0].getAttribute("height")).toBe("36");
    expect(lines[0].querySelector('[data-slot="sparkline-area"]')).toBeTruthy();
    expect(lines[0].getAttribute("class")).toContain("text-success");
    expect(lines[1].getAttribute("class")).toContain("text-destructive");
  });

  it("keeps the split track on cards with an empty split", () => {
    const { container } = renderWidget("visual", { items: canvasItems });
    expect(container.querySelectorAll('[data-slot="kpi-split"]')).toHaveLength(4);
  });

  it("shows no chip or context line in Esencial", () => {
    const { container } = renderWidget("esencial", { items: canvasItems });
    expect(container.querySelector('[data-slot="kpi-delta"], [data-slot="kpi-context"]')).toBeNull();
  });
});

describe("KpiWidget · Esencial", () => {
  it("renders a number + label grid with the same numbers and no charts or tints", () => {
    const { container } = renderWidget("esencial");
    expect(container.querySelectorAll('[data-style="esencial"]')).toHaveLength(1);
    expect(container.querySelector('[data-style="visual"], [data-style="analitico"]')).toBeNull();

    expect(container.querySelectorAll('[data-slot="kpi-item"]')).toHaveLength(4);
    expect(renderedValues(container)).toEqual(sharedValues);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector('[data-slot="kpi-delta"]')).toBeNull();
    expect(container.querySelector('[data-slot="kpi-split"]')).toBeNull();
    const labels = Array.from(container.querySelectorAll("dt")).map((n) => n.textContent);
    expect(labels).toEqual(["Proyectos activos", "Vencidas", "Bloqueadas", "Revisiones · 7 días"]);
    expect(screen.queryByText("Completadas · semana")).toBeNull();
  });
});

describe("KpiWidget · Analítico", () => {
  it("renders RecordTable rows: hoy, Δ 7 días, prom. 30 días, mín–máx, tendencia", () => {
    const { container } = renderWidget("analitico");
    expect(container.querySelectorAll('[data-style="analitico"]:not([data-slot="record-table"])')).toHaveLength(1);
    expect(container.querySelector('[data-style="visual"], [data-style="esencial"]')).toBeNull();

    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""));
    expect(headers).toEqual(["Indicador", "Hoy", "Δ 7 días", "Prom. 30 días", "Mín – máx 30 d", "Tendencia 7 d"]);

    const rows = within(table).getAllByRole("row").slice(1);
    // "Completadas · semana" is visible in Analítico.
    expect(rows).toHaveLength(5);
    const cells = rows.map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells.map((c) => c[1])).toEqual([...sharedValues, kpiFixtureValues.completedWeek]);
    expect(cells[0][0]).toBe("Proyectos activos");
    expect(cells[0][2]).toBe("+2 vs. semana pasada");
    expect(cells[0][3]).toBe("10.4");
    expect(cells[0][4]).toBe("8 – 12");
    expect(cells[4][0]).toBe("Completadas · semana");
    expect(container.querySelectorAll('[data-slot="sparkline"]')).toHaveLength(5);
    expect(container.querySelector('[data-slot="kpi-split"]')).toBeNull();
  });

  it("colors Δ by `good`, not by sign", () => {
    const { container } = renderWidget("analitico");
    const deltas = Array.from(container.querySelectorAll("td [data-good]"));
    expect(deltas.map((d) => d.getAttribute("data-good"))).toEqual(["true", "true", "false", "false"]);
    expect(deltas[1].className).toContain("text-success");
    expect(deltas[2].className).toContain("text-destructive");
  });

  it("reads a zero Δ in a neutral color", () => {
    const { container } = renderWidget("analitico", {
      items: [{ key: "b", label: "Bloqueadas", value: 0, delta: { value: 0, good: true, caption: "vs. semana pasada" } }],
    });
    const cell = container.querySelector("td [data-good]") as HTMLElement;
    expect(cell.textContent).toBe("0 vs. semana pasada");
    expect(cell.className).toContain("text-muted-foreground");
  });

  it("shows a dash instead of a flat trend when there is no series", () => {
    const data = kpiTableData([{ key: "z", label: "Ceros", value: 0, series7: [0, 0, 0, 0, 0, 0, 0] }]);
    expect(data.rows[0].tendencia).toBe("—");
  });

  it("shows a dash for missing data", () => {
    const data = kpiTableData([{ key: "x", label: "Sin historial", value: 3 }]);
    expect(data.rows[0]).toMatchObject({ hoy: "3", delta: "—", avg30: "—", range30: "—", tendencia: "—" });
  });
});

describe("KpiWidget · same fixture in every style", () => {
  it("renders the same headline numbers in Visual, Esencial and Analítico", () => {
    const visual = renderedValues(renderWidget("visual").container);
    cleanup();
    const esencial = renderedValues(renderWidget("esencial").container);
    cleanup();
    renderWidget("analitico");
    const hoy = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1, 1 + kpiFixtureSharedKeys.length)
      .map((r) => within(r).getAllByRole("cell")[1].textContent);
    expect(visual).toEqual(sharedValues);
    expect(esencial).toEqual(visual);
    expect(hoy).toEqual(visual);
  });

  it("visibleKpis keeps items without `visibleIn` in every style", () => {
    expect(visibleKpis(kpiFixture, "visual").map((k) => k.key)).toEqual([...kpiFixtureSharedKeys]);
    expect(visibleKpis(kpiFixture, "esencial").map((k) => k.key)).toEqual([...kpiFixtureSharedKeys]);
    expect(visibleKpis(kpiFixture, "analitico")).toHaveLength(kpiFixture.length);
  });
});

describe("KpiWidget · empty and loading", () => {
  for (const style of ["visual", "esencial", "analitico"] as const) {
    it(`${style}: renders the default empty state with no items`, () => {
      const { container } = renderWidget(style, { items: [] });
      expect(container.querySelector('[data-slot="empty-state"]')).toBeTruthy();
      expect(screen.getByText(KPI_EMPTY_STATE.title)).toBeTruthy();
      expect(container.querySelector('[data-slot="kpi-widget"]')).toBeNull();
    });
  }

  it("renders the `emptyState` prop", () => {
    renderWidget("esencial", { items: [], emptyState: { title: "Sin saldo de vacaciones" } });
    expect(screen.getByText("Sin saldo de vacaciones")).toBeTruthy();
  });

  it("is empty when every item is hidden in the current style", () => {
    const onlyAnalitico = kpiFixture.filter((k) => k.visibleIn?.includes("analitico") && k.visibleIn.length === 1);
    const { container } = renderWidget("visual", { items: onlyAnalitico });
    expect(container.querySelector('[data-slot="empty-state"]')).toBeTruthy();
  });

  it("renders the matching LoadingSkeleton variant per style", () => {
    const v = renderWidget("visual", { loading: true }).container;
    expect(v.querySelector('[data-slot="loading-skeleton"]')?.getAttribute("data-variant")).toBe("kpis");
    expect(v.querySelector('[data-slot="kpi-widget"]')).toBeNull();
    cleanup();
    const e = renderWidget("esencial", { loading: true }).container;
    expect(e.querySelector('[data-slot="loading-skeleton"]')?.getAttribute("data-variant")).toBe("kpis");
    cleanup();
    const a = renderWidget("analitico", { loading: true }).container;
    expect(a.querySelector('[data-slot="loading-skeleton"]')?.getAttribute("data-variant")).toBe("table");
    expect(a.querySelectorAll('[data-skeleton="item"]')).toHaveLength(kpiFixture.length);
  });
});

describe("KpiRow legacy rendering", () => {
  it("renders exactly as before when no widget extras are passed", () => {
    const { container } = render(
      <KpiRow
        tiles={[
          { label: "Proyectos activos", value: 12 },
          { label: "Vencidas", value: 3, tone: "warn" },
        ]}
      />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toBe("mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4");
    const tiles = Array.from(row.children) as HTMLElement[];
    expect(tiles).toHaveLength(2);
    expect(tiles[0].className).toBe("rounded-lg border border-border bg-card p-3.5");
    expect(tiles[0].firstElementChild?.className).toBe(
      "font-mono text-[9.5px] tracking-wide text-muted-foreground uppercase",
    );
    expect(tiles[1].lastElementChild?.className).toContain("text-destructive");
    expect(container.querySelector("svg, a, [data-slot]")).toBeNull();
  });
});
