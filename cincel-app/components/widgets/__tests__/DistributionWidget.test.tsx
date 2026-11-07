// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  DISTRIBUTION_EMPTY_TEXT,
  DISTRIBUTION_HEAT,
  DistributionWidget,
  distributionSummary,
  distributionTable,
  percentOf,
  type DistributionWidgetProps,
} from "@/components/widgets/DistributionWidget";
import {
  distributionEmptyFixture,
  distributionFixture,
  distributionFixtureExpected as expected,
  distributionShareFixture,
} from "@/components/widgets/fixtures/distribution";
import type { PresentationStyle } from "@/lib/types/redesign";

// happy-dom has no layout, so ResponsiveContainer measures 0×0 and renders
// nothing. Pass children straight through so the chart renders.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderWidget(style: PresentationStyle, props: DistributionWidgetProps = distributionFixture) {
  return render(
    <StyleProvider style={style} scope="staff">
      <DistributionWidget {...props} />
    </StyleProvider>,
  );
}

function rowFor(label: string): HTMLElement {
  const row = screen.getAllByRole("row").find((r) => r.textContent?.includes(label));
  if (!row) throw new Error(`row ${label} not found`);
  return row;
}

afterEach(() => {
  cleanup();
});

describe("DistributionWidget", () => {
  it("Visual: donut with role img and aria-label, legend with value and share, total in the center", () => {
    const { container } = renderWidget("visual");
    expect(screen.getByRole("heading", { name: distributionFixture.title })).toBeTruthy();

    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-label")).toBe(
      distributionSummary(distributionFixture.title, distributionFixture.segments, distributionFixture.totalLabel),
    );
    expect(chart.getAttribute("aria-label")).toContain("Presale 9 (18%)");
    expect(chart.getAttribute("aria-label")).toContain("abiertas 51");

    expect(container.querySelector('[data-slot="distribution-total"]')?.textContent).toBe(String(expected.total));
    for (const s of distributionFixture.segments) {
      const li = container.querySelector(`[data-segment="${s.key}"]`) as HTMLElement;
      expect(within(li).getByText(s.label)).toBeTruthy();
      expect(li.querySelector('[data-slot="distribution-value"]')?.textContent).toBe(String(s.value));
      expect(li.querySelector('[data-slot="distribution-share"]')?.textContent).toBe(
        `${expected.share[s.key as keyof typeof expected.share]}%`,
      );
    }
    expect(screen.queryByRole("table")).toBeNull();
    expect(container.querySelector('[data-slot="distribution-esencial"]')).toBeNull();
  });

  it("Esencial: text list label … value, no chart and no table", () => {
    const { container } = renderWidget("esencial");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    const list = container.querySelector('[data-slot="distribution-esencial"]') as HTMLElement;
    expect(list).not.toBeNull();
    for (const s of distributionFixture.segments) {
      const li = list.querySelector(`[data-segment="${s.key}"]`) as HTMLElement;
      expect(within(li).getByText(s.label)).toBeTruthy();
      expect(li.querySelector('[data-slot="distribution-value"]')?.textContent).toBe(String(s.value));
    }
    expect(container.querySelector('[data-slot="distribution-visual"]')).toBeNull();
  });

  it("Analítico: RecordTable with value, secondary, % heat, extra columns and total row", () => {
    const { container } = renderWidget("analitico");
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector('[data-slot="distribution-analitico"]')).not.toBeNull();
    const table = screen.getByRole("table");
    const header = within(table).getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""));
    expect(header).toEqual(["Categoría", "Abiertas", "Vencidas", "% vencidas", "Días prom."]);

    for (const s of distributionFixture.segments) {
      const row = rowFor(s.label);
      const text = row.textContent ?? "";
      expect(text).toContain(String(s.value));
      expect(text).toContain(String(s.secondary));
      expect(text).toContain(String(expected.ratio[s.key as keyof typeof expected.ratio]));
      expect(text).toContain(String(s.extra?.diasProm));
    }

    const totalRow = rowFor("Total");
    expect(totalRow.textContent).toContain(String(expected.total));
    expect(totalRow.textContent).toContain(String(expected.secondaryTotal));
    expect(totalRow.textContent).toContain(String(expected.ratioTotal));
  });

  it("renders the same numbers in Visual, Esencial and Analítico", () => {
    for (const style of STYLES) {
      const { container, unmount } = renderWidget(style);
      const text = container.textContent ?? "";
      for (const s of distributionFixture.segments) {
        expect(text).toContain(s.label);
        expect(text).toContain(String(s.value));
      }
      unmount();
    }
  });

  it("builds the Analítico table data from the fixture", () => {
    const data = distributionTable(distributionFixture);
    expect(data.rows.map((r) => r.value)).toEqual([9, 14, 22, 6]);
    expect(data.rows.map((r) => r.secondary)).toEqual([5, 8, 14, 4]);
    expect(data.rows.map((r) => r.ratio)).toEqual(Object.values(expected.ratio));
    expect(data.rows.map((r) => r["extra:diasProm"])).toEqual([3.1, 5.4, 9.8, 4.2]);
    expect(data.totals).toEqual({ label: "Total", value: 51, secondary: 31, ratio: 61 });
    expect(data.heat).toEqual([{ key: "ratio", ...DISTRIBUTION_HEAT }]);
    expect(DISTRIBUTION_HEAT).toEqual({ warnAt: 45, critAt: 60 });
    expect(data.columns.find((c) => c.key === "ratio")?.format).toBe("percent");
  });

  it("uses the share of the total as the % column when there is no secondary value", () => {
    const data = distributionTable(distributionShareFixture);
    expect(data.columns.map((c) => c.key)).toEqual(["label", "value", "share"]);
    expect(data.rows.map((r) => r.share)).toEqual([75, 25]);
    expect(data.totals).toEqual({ label: "Total", value: 4, share: 100 });
    expect(data.heat).toBeUndefined();
  });

  it("percentOf rounds and guards a zero total", () => {
    expect(percentOf(5, 9)).toBe(56);
    expect(percentOf(1, 0)).toBeNull();
  });

  it.each(STYLES)("%s: shows the empty state with the default copy", (style) => {
    renderWidget(style, distributionEmptyFixture);
    expect(screen.getByText(DISTRIBUTION_EMPTY_TEXT)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the emptyText prop when every value is 0", () => {
    renderWidget("visual", {
      ...distributionFixture,
      segments: distributionFixture.segments.map((s) => ({ ...s, value: 0 })),
      emptyText: "Aún no hay tareas abiertas",
    });
    expect(screen.getByText("Aún no hay tareas abiertas")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([
    ["visual", "list"],
    ["esencial", "list"],
    ["analitico", "table"],
  ] as const)("%s: loading renders the %s LoadingSkeleton variant", (style, variant) => {
    const { container } = renderWidget(style, { ...distributionFixture, loading: true });
    const skeleton = container.querySelector('[data-slot="loading-skeleton"]');
    expect(skeleton?.getAttribute("data-variant")).toBe(variant);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText("Presale")).toBeNull();
  });
});
