// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { FolderKanban } from "lucide-react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  PROGRESS_LIST_EMPTY_TEXT,
  PROGRESS_RING_SIZE,
  ProgressListWidget,
  progressTableData,
  type ProgressListWidgetProps,
} from "@/components/widgets/ProgressListWidget";
import { progressListEmptyFixture, progressListFixture } from "@/components/widgets/fixtures/progress-list";
import type { PresentationStyle } from "@/lib/types/redesign";

/** The real % of each fixture item, as every style must show it. */
const REAL = progressListFixture.items.map((item) => `${Math.round(item.real)}%`);

function renderWidget(style: PresentationStyle, props: Partial<ProgressListWidgetProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <ProgressListWidget title={progressListFixture.title} items={progressListFixture.items} {...props} />
    </StyleProvider>,
  );
}

function region() {
  return screen.getByRole("region", { name: progressListFixture.title });
}

/** The real % shown per item, in fixture order. */
function shownReal(container: HTMLElement): string[] {
  return progressListFixture.items.map((item) => {
    const el = container.querySelector(`[data-item="${item.id}"] [data-value="real"]`);
    return el?.textContent?.trim() ?? "";
  });
}

afterEach(() => {
  cleanup();
});

describe("ProgressListWidget", () => {
  it("Visual (bars): one bar per item with the real %, filled with the item color", () => {
    const { container } = renderWidget("visual");
    expect(region().getAttribute("data-style")).toBe("visual");
    expect(container.querySelector('[data-slot="progress-bars"]')).not.toBeNull();
    expect(shownReal(container)).toEqual(REAL);

    const [first] = progressListFixture.items;
    const bar = container.querySelector(`[data-item="${first.id}"] [aria-hidden="true"] span`) as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar?.style.width).toBe(`${first.real}%`);
    expect(bar?.getAttribute("style")).toContain(`background-color: ${first.colorVar}`);

    expect(screen.getByRole("link", { name: first.label }).getAttribute("href")).toBe(first.href);
    // Items without href render plain text.
    expect(screen.queryByRole("link", { name: "Oficina Polanco" })).toBeNull();
    expect(screen.getByText("Oficina Polanco")).toBeTruthy();
    // Only the chosen style is rendered.
    expect(container.querySelector('[data-slot="progress-list"]')).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("Visual (rings): rings of 52–64 px with the same numbers", () => {
    const { container } = renderWidget("visual", { variant: "rings" });
    expect(container.querySelector('[data-slot="progress-rings"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="progress-bars"]')).toBeNull();
    expect(PROGRESS_RING_SIZE).toBeGreaterThanOrEqual(52);
    expect(PROGRESS_RING_SIZE).toBeLessThanOrEqual(64);

    for (const [i, item] of progressListFixture.items.entries()) {
      const li = container.querySelector(`[data-item="${item.id}"]`) as HTMLElement;
      expect(within(li).getByText(REAL[i])).toBeTruthy();
      expect(within(li).getByText(item.label)).toBeTruthy();
      const ring = li.querySelector('[data-slot="progress-ring"]') as HTMLElement | null;
      expect(ring).not.toBeNull();
      expect(ring?.getAttribute("style")).toContain(`width: ${PROGRESS_RING_SIZE}px`);
      expect(ring?.querySelector('[data-slot="progress-ring-fill"]')?.getAttribute("stroke")).toBe(item.colorVar);
    }
  });

  it("Esencial: a 'label … n%' text list with the same numbers and no fills", () => {
    const { container } = renderWidget("esencial");
    expect(region().getAttribute("data-style")).toBe("esencial");
    const list = container.querySelector('[data-slot="progress-list"]') as HTMLElement;
    expect(list).not.toBeNull();
    expect(shownReal(container)).toEqual(REAL);
    for (const item of progressListFixture.items) {
      const li = list.querySelector(`[data-item="${item.id}"]`) as HTMLElement;
      expect(li.textContent).toContain(item.label);
    }
    expect(container.querySelector('[style*="conic-gradient"]')).toBeNull();
    expect(container.querySelector('[data-slot="progress-bars"]')).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("Analítico: RecordTable with real, plan, desviación, presupuesto and próxima entrega", () => {
    const { container } = renderWidget("analitico");
    expect(region().getAttribute("data-style")).toBe("analitico");
    const table = container.querySelector("table") as HTMLElement;
    expect(table).not.toBeNull();
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((th) => (th.textContent ?? "").replace(/[▲▼]/g, "").trim());
    expect(headers).toEqual(["Nombre", "Real", "Plan", "Desviación", "Presupuesto", "Próxima entrega"]);

    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(progressListFixture.items.length);
    const cells = rows.map((row) => within(row).getAllByRole("cell").map((td) => td.textContent?.trim()));

    // Same real % as Visual and Esencial.
    expect(cells.map((c) => c[1])).toEqual(REAL);
    expect(cells.map((c) => c[2])).toEqual(["70%", "40%", "18%"]);
    expect(cells.map((c) => c[3])).toEqual(["−8%", "+5%", "0%"]);
    expect(cells.map((c) => c[4])).toEqual(["58%", "30%", "—"]);
    expect(cells[0][5]).toContain("Entrega de cocina");
    expect(cells[2][5]).toBe("—");

    const behind = table.querySelector('[data-deviation="behind"]');
    const ahead = table.querySelector('[data-deviation="ahead"]');
    expect(behind?.className).toContain("text-destructive");
    expect(ahead?.className).toContain("text-success");
    expect(container.querySelector('[data-slot="progress-bars"]')).toBeNull();
    expect(container.querySelector('[data-slot="progress-list"]')).toBeNull();
  });

  it("Analítico drops the Presupuesto column when no item carries budgetPct", () => {
    const items = progressListFixture.items.map((item) => ({ ...item, budgetPct: null }));
    expect(progressTableData(items).columns.map((c) => c.key)).toEqual(["label", "real", "plan", "deviation", "next"]);
    renderWidget("analitico", { items });
    expect(screen.queryByRole("columnheader", { name: "Presupuesto" })).toBeNull();
  });

  it("progressTableData rounds and clamps like the other styles", () => {
    const data = progressTableData([{ id: "x", label: "X", real: 104.6, plan: 49.5 }]);
    expect(data.rows[0]).toMatchObject({ id: "x", real: 100, plan: 50, deviation: 50, budget: null, next: null });
  });

  it.each(["visual", "esencial", "analitico"] as const)("%s: empty state with the default copy", (style) => {
    renderWidget(style, { items: progressListEmptyFixture.items });
    expect(within(region()).getByText(PROGRESS_LIST_EMPTY_TEXT)).toBeTruthy();
  });

  it("empty state uses emptyText, and emptyState wins over it", () => {
    renderWidget("visual", { items: [], emptyText: "Sin proyectos activos" });
    expect(screen.getByText("Sin proyectos activos")).toBeTruthy();
    cleanup();
    renderWidget("esencial", {
      items: [],
      emptyText: "No se usa",
      emptyState: { icon: FolderKanban, title: "Aún no hay proyectos activos", description: "Crea el primero para empezar." },
    });
    expect(screen.getByText("Aún no hay proyectos activos")).toBeTruthy();
    expect(screen.queryByText("No se usa")).toBeNull();
  });

  it.each([
    ["visual", "list"],
    ["esencial", "list"],
    ["analitico", "table"],
  ] as const)("%s: loading renders the %s LoadingSkeleton", (style, variant) => {
    const { container } = renderWidget(style, { loading: true });
    const skeleton = container.querySelector('[data-slot="loading-skeleton"]');
    expect(skeleton?.getAttribute("data-variant")).toBe(variant);
    expect(container.querySelector('[data-item]')).toBeNull();
  });
});
