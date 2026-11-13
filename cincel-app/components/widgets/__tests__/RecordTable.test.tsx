// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import {
  RECORD_TABLE_EMPTY_TITLE,
  RecordTable,
  RecordTableSkeleton,
  type RecordTableProps,
} from "@/components/widgets/RecordTable";
import {
  computeTotals,
  formatValue,
  heatLevel,
  visibleColumns,
} from "@/components/widgets/record-table-format";
import {
  recordTableEmptyFixture,
  recordTableFixture,
  recordTableFixtureTotals,
  recordTableGroupedFixture,
} from "@/components/widgets/fixtures/record-table";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderTable(style: PresentationStyle, props: Partial<RecordTableProps> = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <RecordTable data={recordTableFixture} {...props} />
    </StyleProvider>,
  );
}

/** The table row (Visual / Analítico) or list item (Esencial) holding `label`. */
function itemFor(label: string): HTMLElement {
  const items = [...document.querySelectorAll<HTMLElement>("tbody tr, [data-slot='record-item']")];
  const item = items.find((el) => el.textContent?.includes(label));
  if (!item) throw new Error(`row ${label} not found`);
  return item;
}

/** Body cell of a row by column key (Visual / Analítico), from the visible header order. */
function cellFor(label: string, key: string, style: PresentationStyle): HTMLElement {
  const index = visibleColumns(recordTableFixture.columns, style).findIndex((c) => c.key === key);
  return itemFor(label).querySelectorAll<HTMLElement>("td")[index];
}

/** Header labels without the sort arrows `DataTable` adds. */
function headerLabels(): string[] {
  return screen.getAllByRole("columnheader").map((h) => (h.textContent ?? "").replace(/[▲▼]/g, ""));
}

afterEach(() => cleanup());

describe("RecordTable, same fixture in every style", () => {
  it.each(STYLES)("%s renders the same numbers per row and only its own style", (style) => {
    const { container } = renderTable(style);
    const rendered = container.querySelectorAll("[data-slot='record-table']");
    expect(rendered).toHaveLength(1);
    expect(rendered[0].getAttribute("data-style")).toBe(style);

    for (const row of recordTableFixture.rows) {
      const item = itemFor(String(row.etapa));
      expect(item.textContent).toContain(formatValue(row.abiertas, "count"));
      expect(item.textContent).toContain(formatValue(row.vencidas, "count"));
      expect(item.textContent).toContain(formatValue(row.pctVencidas, "percent"));
    }
    expect(itemFor("Diseño").textContent).toContain("70%");
    expect(itemFor("Construcción").textContent).toContain("20");
  });

  it("visual: rows in a table, no totals and no heat; budget hidden by hideOn", () => {
    const { container } = renderTable("visual");
    expect(headerLabels()).toEqual([
      "Etapa",
      "Abiertas",
      "Vencidas",
      "% venc.",
      "Días prom.",
    ]);
    expect(container.querySelector("[data-slot='totals-row']")).toBeNull();
    expect(cellFor("Diseño", "pctVencidas", "visual").className).not.toContain("--destructive");
    expect(cellFor("Diseño", "abiertas", "visual").className).toContain("text-right");
    expect(cellFor("Diseño", "abiertas", "visual").className).not.toContain("font-mono");
  });

  it("esencial: plain list without heat, totals or hidden columns", () => {
    const { container } = renderTable("esencial");
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("[data-slot='record-item']")).toHaveLength(recordTableFixture.rows.length);
    expect(container.textContent).not.toContain("Días prom.");
    expect(container.textContent).not.toContain("Presupuesto");
    expect(container.querySelector("[data-slot='totals-row']")).toBeNull();
    expect(container.innerHTML).not.toContain("--destructive");
    expect(container.innerHTML).not.toContain("--warning");
    expect(container.textContent).not.toContain(formatValue(recordTableFixtureTotals.abiertas, "count"));
  });

  it("analitico: 12.5 px, muted header, every column, mono right-aligned numbers and the auto totals row", () => {
    const { container } = renderTable("analitico");
    const table = container.querySelector("table")!;
    expect(table.className).toContain("text-[12.5px]");
    expect(table.className).toContain("[&_thead_tr]:bg-muted");
    expect(headerLabels()).toContain("Presupuesto");
    expect(screen.getByRole("columnheader", { name: "Abiertas" }).className).toContain("text-[11.5px]");

    const abiertas = cellFor("Diseño", "abiertas", "analitico");
    expect(abiertas.className).toContain("font-mono");
    expect(abiertas.className).toContain("text-right");
    const etapa = cellFor("Diseño", "etapa", "analitico");
    expect(etapa.className).not.toContain("font-mono");
    expect(etapa.className).not.toContain("text-right");

    const totals = container.querySelector<HTMLElement>("[data-slot='totals-row']")!;
    expect(totals).not.toBeNull();
    const cell = (key: string) => totals.querySelector(`[data-column='${key}']`)?.textContent;
    expect(cell("etapa")).toBe("Total");
    expect(cell("abiertas")).toBe("48");
    expect(cell("vencidas")).toBe("19");
    expect(cell("pctVencidas")).toBe("35%");
    expect(cell("diasProm")).toBe("2.5 d");
    expect(cell("presupuesto")).toBe(formatValue(650000, "mxn"));
  });

  it("analitico: heat cells above warnAt (warning) and critAt (destructive)", () => {
    renderTable("analitico");
    expect(cellFor("Diseño", "pctVencidas", "analitico").className).toContain("bg-tint-destructive text-destructive-ink");
    expect(cellFor("Construcción", "pctVencidas", "analitico").className).toContain("bg-tint-warning text-warning-ink");
    expect(cellFor("Decoración", "pctVencidas", "analitico").className).not.toMatch(/tint-warning|tint-destructive/);
    expect(cellFor("Diseño", "abiertas", "analitico").className).not.toMatch(/tint-warning|tint-destructive/);
  });
});

describe("RecordTable grouping", () => {
  it.each(STYLES)("%s groups rows by groupBy in order of first appearance with a count", (style) => {
    const { container } = renderTable(style, { data: recordTableGroupedFixture });
    const headers = [...container.querySelectorAll("[data-slot='group-header']")].map((h) => h.textContent);
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain("En proceso");
    expect(headers[0]).toContain("2");
    expect(headers[1]).toContain("Pendiente");
    expect(headers[1]).toContain("1");
    const text = container.textContent ?? "";
    expect(text.indexOf("Render sala")).toBeLessThan(text.indexOf("Cotizar cancelería"));
    expect(text).toContain(formatValue("2026-11-02", "date"));
    expect(text).toContain("−12");
  });

  it("negative deltas are destructive text in the table styles", () => {
    renderTable("analitico", { data: recordTableGroupedFixture });
    const cells = [...itemFor("Planos de cocina").querySelectorAll("td")];
    const delta = cells.find((td) => td.textContent === "−12")!;
    expect(delta.className).toContain("text-destructive");
    expect(delta.className).toContain("font-mono");
  });
});

describe("RecordTable props", () => {
  it.each(STYLES)("%s uses renderCell when it returns a node and the format otherwise", (style) => {
    renderTable(style, {
      renderCell: (key, row) => (key === "etapa" ? <a href={`/etapas/${String(row.id)}`}>{String(row.etapa)}</a> : undefined),
    });
    expect(screen.getByRole("link", { name: "Diseño" }).getAttribute("href")).toBe("/etapas/diseno");
    expect(itemFor("Diseño").textContent).toContain("70%");
  });

  it("density sets the row padding", () => {
    renderTable("visual", { density: "compacta" });
    expect(cellFor("Diseño", "etapa", "visual").className).toContain("py-1");
    cleanup();
    renderTable("visual", { density: "comoda" });
    expect(cellFor("Diseño", "etapa", "visual").className).toContain("py-2.5");
    cleanup();
    renderTable("analitico");
    expect(cellFor("Diseño", "etapa", "analitico").className).toContain("py-1");
  });

  it.each(STYLES)("%s selectable shows the bulk bar with export and clears the selection", (style) => {
    renderTable(style, { selectable: true });
    expect(screen.queryByText(/seleccionadas/)).toBeNull();
    const checkbox = within(itemFor("Diseño")).getByRole("checkbox", { name: "Seleccionar fila" });
    fireEvent.click(checkbox);
    expect(screen.getByText("1 filas seleccionadas")).toBeTruthy();
    expect(screen.getByText("Exportar ▼")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar selección" }));
    expect(screen.queryByText(/seleccionadas/)).toBeNull();
  });

  it("the header checkbox selects every row in the table styles", () => {
    renderTable("analitico", { selectable: true });
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todo" }));
    expect(screen.getByText(`${recordTableFixture.rows.length} filas seleccionadas`)).toBeTruthy();
  });

  it.each(STYLES)("%s runs a row action with the row", async (style) => {
    const onSelect = vi.fn();
    renderTable(style, { rowActions: [{ label: "Ver detalle", onSelect }] });
    fireEvent.click(within(itemFor("Construcción")).getByLabelText("Acciones"));
    fireEvent.click(await screen.findByText("Ver detalle"));
    expect(onSelect).toHaveBeenCalledWith(recordTableFixture.rows[1]);
  });
});

describe("RecordTable empty and loading", () => {
  it.each(STYLES)("%s shows the default empty state", (style) => {
    const { container } = renderTable(style, { data: recordTableEmptyFixture });
    expect(screen.getByText(RECORD_TABLE_EMPTY_TITLE)).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
  });

  it("shows the emptyState prop", () => {
    renderTable("analitico", {
      data: recordTableEmptyFixture,
      emptyState: { title: "No hay tareas con estos filtros", action: { label: "Quitar filtros", href: "/tareas" } },
    });
    expect(screen.getByText("No hay tareas con estos filtros")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" })).toBeTruthy();
  });

  it.each([
    ["visual", "table"],
    ["esencial", "list"],
    ["analitico", "table"],
  ] as const)("%s loading uses the %s LoadingSkeleton", (style, variant) => {
    const { container } = render(
      <StyleProvider style={style} scope="staff">
        <RecordTableSkeleton />
      </StyleProvider>,
    );
    const skeleton = container.querySelector("[data-slot='loading-skeleton']");
    expect(skeleton?.getAttribute("data-variant")).toBe(variant);
  });
});

describe("record-table-format", () => {
  it("heat thresholds are strict", () => {
    const heat = recordTableFixture.heat;
    expect(heatLevel(heat, "pctVencidas", 45)).toBeNull();
    expect(heatLevel(heat, "pctVencidas", 46)).toBe("warn");
    expect(heatLevel(heat, "pctVencidas", 60)).toBe("warn");
    expect(heatLevel(heat, "pctVencidas", 61)).toBe("crit");
    expect(heatLevel(heat, "abiertas", 99)).toBeNull();
    expect(heatLevel(heat, "pctVencidas", null)).toBeNull();
  });

  it("formats every column format in es-MX", () => {
    expect(formatValue(1234, "count")).toBe("1,234");
    expect(formatValue(33.33, "percent")).toBe("33.3%");
    expect(formatValue(7.5, "hours")).toBe("7.5 h");
    expect(formatValue(3, "days")).toBe("3 d");
    expect(formatValue(4, "delta")).toBe("+4");
    expect(formatValue(-4, "delta")).toBe("−4");
    expect(formatValue(0, "delta")).toBe("0");
    expect(formatValue(12500, "mxn")).toBe("$12,500");
    expect(formatValue("2026-11-02", "date")).toBe(formatValue("2026-11-02", "date").toLowerCase());
    expect(formatValue(null, "count")).toBe("—");
    expect(formatValue("Casa", "text")).toBe("Casa");
  });

  it("auto totals sum counts and average percent and days; explicit totals get the label", () => {
    const columns = recordTableFixture.columns;
    expect(computeTotals(recordTableFixture, columns)).toEqual({ etapa: "Total", ...recordTableFixtureTotals });
    expect(computeTotals({ ...recordTableFixture, totals: { abiertas: 1 } }, columns)).toEqual({
      etapa: "Total",
      abiertas: 1,
    });
    expect(computeTotals({ ...recordTableFixture, totals: undefined }, columns)).toBeNull();
  });
});
