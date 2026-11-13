// @vitest-environment happy-dom
/**
 * The opt-in dashboard props of the widget library (#967, zustand.md §2.5):
 * `WidgetCard` collapse, `LineSeriesWidget` hidden series and `view`,
 * `KpiWidget` selection and `view`, `DistributionWidget` / `PeopleWidget`
 * `view`. Without them each widget renders as before (their own tests).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import Link from "next/link";
import { useState, type ReactNode } from "react";

vi.mock("@/lib/etapas/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, number> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    etapaLabel: (key: string) => labels[key] ?? key,
    etapaColorSlot: (key: string) => slots[key] ?? null,
    etapaColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

// The chart chunk is lazy and recharts needs layout; render what would be drawn instead.
vi.mock("@/components/widgets/charts/lazy", () => ({
  LazyAreaSeriesChart: ({ series, rows }: { series: { key: string }[]; rows: Record<string, unknown>[] }) => (
    <div data-testid="area-chart" data-series={series.map((s) => s.key).join(",")} data-row-keys={Object.keys(rows[0] ?? {}).sort().join(",")} />
  ),
  LazyDonutChart: () => <div data-testid="donut-chart" />,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { LineSeriesWidget, type LineSeriesWidgetProps } from "@/components/widgets/LineSeriesWidget";
import { PeopleWidget } from "@/components/widgets/PeopleWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { distributionFixture } from "@/components/widgets/fixtures/distribution";
import { kpiFixture, kpiFixtureSharedKeys } from "@/components/widgets/fixtures/kpi";
import { PEOPLE_FIXTURE } from "@/components/widgets/fixtures/people";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function inStyle(style: PresentationStyle, node: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      <main>
        <h1>Inicio</h1>
        {node}
      </main>
    </StyleProvider>,
  );
}

async function seriousViolations() {
  const results = await axe.run(document.body);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// ── WidgetCard collapse ─────────────────────────────────────────────────────

function CollapsibleCard({ initial = false }: { initial?: boolean }) {
  const [collapsed, setCollapsed] = useState(initial);
  return (
    <WidgetCard
      title="Ritmo semanal"
      actions={<Link href="/tareas">Ver todo</Link>}
      collapsible={{ collapsed, onToggle: () => setCollapsed((c) => !c) }}
    >
      <p>Cuerpo del widget</p>
    </WidgetCard>
  );
}

describe("WidgetCard · collapsible", () => {
  for (const style of STYLES) {
    it(`${style}: the toggle (a keyboard-operable button) collapses and expands the body`, () => {
      inStyle(style, <CollapsibleCard />);
      const region = screen.getByRole("region", { name: "Ritmo semanal" });
      const toggle = within(region).getByRole("button", { name: "Contraer" });
      expect(toggle.tagName).toBe("BUTTON");
      expect(toggle.getAttribute("type")).toBe("button");
      expect(toggle.getAttribute("title")).toBe("Contraer");
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const bodyId = toggle.getAttribute("aria-controls");
      expect(bodyId).toBeTruthy();
      expect(document.getElementById(bodyId as string)?.textContent).toContain("Cuerpo del widget");
      // The existing actions stay in the slot.
      expect(within(region).getByRole("link", { name: "Ver todo" })).toBeTruthy();

      toggle.focus();
      expect(document.activeElement).toBe(toggle);
      fireEvent.click(toggle);
      const expand = within(region).getByRole("button", { name: "Expandir" });
      expect(expand.getAttribute("aria-expanded")).toBe("false");
      expect(expand.getAttribute("title")).toBe("Expandir");
      expect(within(region).queryByText("Cuerpo del widget")).toBeNull();
      expect(document.getElementById(bodyId as string)).toBeNull();

      fireEvent.click(expand);
      expect(within(region).getByText("Cuerpo del widget")).toBeTruthy();
      expect(within(region).getByRole("button", { name: "Contraer" }).getAttribute("aria-expanded")).toBe("true");
    });

    it(`${style}: expanded and collapsed have no serious or critical violations`, async () => {
      inStyle(style, <CollapsibleCard />);
      expect(await seriousViolations()).toEqual([]);
      fireEvent.click(screen.getByRole("button", { name: "Contraer" }));
      expect(await seriousViolations()).toEqual([]);
    });
  }

  it("without `collapsible` there is no toggle and the body has no id", () => {
    const { container } = inStyle(
      "visual",
      <WidgetCard title="Ritmo semanal">
        <p>Cuerpo</p>
      </WidgetCard>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector('[data-slot="card-content"]')?.hasAttribute("id")).toBe(false);
  });
});

// ── LineSeriesWidget ────────────────────────────────────────────────────────

const LINE_PROPS: LineSeriesWidgetProps = {
  title: "Ritmo semanal",
  points: [
    { key: "w1", label: "Sem 1", values: { created: 5, completed: 3 } },
    { key: "w2", label: "Sem 2", values: { created: 7, completed: 6 } },
  ],
  series: [
    { key: "created", label: "Creadas", colorVar: "var(--chart-1)", area: true },
    { key: "completed", label: "Completadas", colorVar: "var(--chart-2)", dashed: true },
  ],
  table: {
    columns: [
      { key: "label", label: "Semana", format: "text" },
      { key: "created", label: "Creadas", align: "right", format: "count" },
      { key: "completed", label: "Completadas", align: "right", format: "count" },
    ],
    rows: [
      { id: "w1", label: "Sem 1", created: 5, completed: 3 },
      { id: "w2", label: "Sem 2", created: 7, completed: 6 },
    ],
  },
};

function ToggleableLine(props: Partial<LineSeriesWidgetProps>) {
  const [hidden, setHidden] = useState<string[]>([]);
  return (
    <LineSeriesWidget
      {...LINE_PROPS}
      {...props}
      hiddenSeries={hidden}
      onToggleSeries={(key) => setHidden((h) => (h.includes(key) ? h.filter((k) => k !== key) : [...h, key]))}
    />
  );
}

describe("LineSeriesWidget · dashboard props", () => {
  it("hidden series are not drawn (Visual) and their legend button is not pressed", () => {
    inStyle("visual", <ToggleableLine />);
    const chart = screen.getByTestId("area-chart");
    expect(chart.getAttribute("data-series")).toBe("created,completed");
    const created = screen.getByRole("button", { name: "Creadas" });
    expect(created.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(created);
    expect(screen.getByTestId("area-chart").getAttribute("data-series")).toBe("completed");
    expect(screen.getByTestId("area-chart").getAttribute("data-row-keys")).toBe("completed,label");
    expect(screen.getByRole("button", { name: "Creadas" }).getAttribute("aria-pressed")).toBe("false");

    // The last shown series cannot be hidden.
    const completed = screen.getByRole("button", { name: "Completadas" });
    expect(completed.getAttribute("aria-pressed")).toBe("true");
    expect((completed as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Creadas" }));
    expect(screen.getByTestId("area-chart").getAttribute("data-series")).toBe("created,completed");
  });

  it("hidden series are not listed (Esencial) nor shown as table columns (Analítico)", () => {
    const { unmount } = inStyle("esencial", <LineSeriesWidget {...LINE_PROPS} hiddenSeries={["completed"]} />);
    expect(screen.getByText("5 creadas")).toBeTruthy();
    expect(screen.queryByText(/completadas/)).toBeNull();
    unmount();

    inStyle("analitico", <LineSeriesWidget {...LINE_PROPS} hiddenSeries={["completed"]} />);
    const headers = screen.getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, "").trim());
    expect(headers).toContain("Creadas");
    expect(headers).not.toContain("Completadas");
  });

  it("without `onToggleSeries` there are no legend buttons", () => {
    inStyle("visual", <LineSeriesWidget {...LINE_PROPS} />);
    expect(screen.queryByRole("group", { name: "Series" })).toBeNull();
  });

  it("`view` overrides the style: table in Visual, chart in Analítico", () => {
    const { unmount } = inStyle("visual", <LineSeriesWidget {...LINE_PROPS} view="table" />);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByTestId("area-chart")).toBeNull();
    unmount();

    const second = inStyle("analitico", <LineSeriesWidget {...LINE_PROPS} view="chart" />);
    expect(screen.getByTestId("area-chart")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    second.unmount();

    inStyle("esencial", <LineSeriesWidget {...LINE_PROPS} view="table" />);
    expect(screen.getByRole("table")).toBeTruthy();
  });

  for (const style of STYLES) {
    it(`${style}: legend toggles have no serious or critical violations`, async () => {
      inStyle(style, <ToggleableLine />);
      fireEvent.click(screen.getByRole("button", { name: "Creadas" }));
      expect(await seriousViolations()).toEqual([]);
    });
  }
});

// ── KpiWidget ───────────────────────────────────────────────────────────────

function SelectableKpis({ style }: { style: PresentationStyle }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <StyleProvider style={style} scope="staff">
      <main>
        <h1>Inicio</h1>
        <KpiWidget items={kpiFixture} selectedKey={selected} onSelect={(key) => setSelected((s) => (s === key ? null : key))} />
        <output data-testid="selected">{selected ?? ""}</output>
      </main>
    </StyleProvider>
  );
}

describe("KpiWidget · selection and view", () => {
  for (const style of STYLES) {
    it(`${style}: KPIs are toggle buttons with aria-pressed`, () => {
      render(<SelectableKpis style={style} />);
      const overdue = screen.getByRole("button", { name: /Vencidas/ });
      expect(overdue.getAttribute("aria-pressed")).toBe("false");
      fireEvent.click(overdue);
      expect(screen.getByTestId("selected").textContent).toBe("overdue");
      expect(screen.getByRole("button", { name: /Vencidas/ }).getAttribute("aria-pressed")).toBe("true");
      // Only the selected one is pressed.
      const pressed = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true");
      expect(pressed).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: /Vencidas/ }));
      expect(screen.getByTestId("selected").textContent).toBe("");
    });

    it(`${style}: selectable KPIs have no serious or critical violations`, async () => {
      render(<SelectableKpis style={style} />);
      fireEvent.click(screen.getByRole("button", { name: /Vencidas/ }));
      expect(await seriousViolations()).toEqual([]);
    });
  }

  it("without `onSelect` the tiles stay links", () => {
    inStyle("visual", <KpiWidget items={kpiFixture} />);
    expect(screen.queryByRole("button", { name: /Vencidas/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Proyectos activos/ }).getAttribute("href")).toBe("/proyectos");
  });

  it("`view` overrides the style: table in Visual, tiles in Analítico", () => {
    const { container, unmount } = inStyle("visual", <KpiWidget items={kpiFixture} view="table" />);
    expect(container.querySelector('[data-style="analitico"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="kpi-tile"]')).toBeNull();
    unmount();

    const second = inStyle("analitico", <KpiWidget items={kpiFixture} view="chart" />);
    expect(second.container.querySelector('[data-style="visual"]')).not.toBeNull();
    expect(second.container.querySelectorAll('[data-slot="kpi-tile"]').length).toBeGreaterThanOrEqual(kpiFixtureSharedKeys.length);
  });
});

// ── DistributionWidget / PeopleWidget view ──────────────────────────────────

describe("DistributionWidget · view", () => {
  it("`view` overrides the style", () => {
    const { container, unmount } = inStyle("visual", <DistributionWidget {...distributionFixture} view="table" />);
    expect(container.querySelector('[data-slot="distribution-analitico"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="distribution-visual"]')).toBeNull();
    unmount();

    const second = inStyle("esencial", <DistributionWidget {...distributionFixture} view="chart" />);
    expect(second.container.querySelector('[data-slot="distribution-visual"]')).not.toBeNull();
    expect(second.container.querySelector('[data-slot="distribution-esencial"]')).toBeNull();
  });
});

describe("PeopleWidget · view", () => {
  it("`view` overrides the style", () => {
    const { unmount } = inStyle("visual", <PeopleWidget people={PEOPLE_FIXTURE} show={["load", "projects"]} view="table" />);
    expect(screen.getAllByRole("table").length).toBeGreaterThan(0);
    expect(screen.queryByRole("article")).toBeNull();
    unmount();

    inStyle("analitico", <PeopleWidget people={PEOPLE_FIXTURE} show={["load", "projects"]} view="chart" />);
    expect(screen.getAllByRole("article").length).toBe(PEOPLE_FIXTURE.length);
  });
});
