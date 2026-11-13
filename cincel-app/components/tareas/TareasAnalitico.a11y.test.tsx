// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, scroll, prefetch, ...rest }: { href: string; children: ReactNode; scroll?: boolean; prefetch?: boolean }) => {
    void scroll;
    void prefetch;
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasPageData: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasSummary: vi.fn(),
  getTareasListPage: vi.fn(async () => ({ rows: [], nextCursor: null, total: 0 })),
  getTaskChildren: vi.fn(async () => []),
  getTaskChildrenBatch: vi.fn(async () => ({})),
}));
vi.mock("./use-tareas-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-tareas-page")>()),
  useTareasPageReady: () => true,
}));
vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {actions}
    </header>
  ),
}));
// The quick-add line has its own a11y test (`QuickAddRow`); here a labelled input in a row stands in.
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: ({ context, colSpan }: { context: { label: string }; colSpan?: number }) => (
    <tr>
      <td colSpan={colSpan}>
        <label>
          {context.label}
          <input type="text" />
        </label>
      </td>
    </tr>
  ),
}));
vi.mock("./quick-add-create", () => ({ useQuickAddCreate: () => ({ create: vi.fn(), undo: vi.fn() }) }));

import { TareasAnalitico } from "./TareasAnalitico";
import {
  ANALITICO_FACETS,
  ANALITICO_SUMMARY,
  ANALITICO_ETAPAS,
  LOMAS_PRESALE_ROWS,
  analiticoTaskRow,
  seedAnalitico,
} from "./fixtures/analitico-summary";
import { qk } from "@/lib/query/keys";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { tareasListFiltersOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetTareasUi } from "@/lib/stores/tareas-ui-store";
import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";

function renderAnalitico(query: TareasQuery = DEFAULT_TAREAS_QUERY, onQuery: (patch: Partial<TareasQuery>) => void = vi.fn()) {
  const client = createTestQueryClient();
  seedAnalitico(client, tareasListFiltersOf(DEFAULT_TAREAS_QUERY), ANALITICO_SUMMARY);
  client.setQueryData(qk.tasks.children("t1"), [
    analiticoTaskRow({ id: "t1a", title: "Cláusulas", parentTaskId: "t1", project: LOMAS_PRESALE_ROWS[0].project }),
  ]);
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <TareasAnalitico
        query={query}
        facets={ANALITICO_FACETS}
        etapas={ANALITICO_ETAPAS}
        staff={[{ id: "s1", name: "Ana Ruiz" }]}
        actions={null}
        search=""
        onSearch={vi.fn()}
        onQuery={onQuery}
        empty={{ title: "No hay tareas con estos filtros" }}
        canCreate
      />
    </StyleProvider>,
    { client },
  );
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
  resetTareasUi();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-style");
});

describe("TareasAnalitico accessibility", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`axe clean light and dark (${mode})`, async () => {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.setAttribute("data-style", "analitico");
      const { container } = renderAnalitico();
      await act(async () => {});
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("aria-expanded and aria-controls per group", () => {
    const { container } = renderAnalitico();
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    const toggles = within(lomas)
      .getAllByRole("button")
      .filter(
        (b) =>
          b.hasAttribute("aria-expanded") &&
          !b.closest('[data-slot="row-actions-cell"]') &&
          b.dataset.slot !== "row-detail-toggle",
      );
    // The project header and one button per etapa group.
    expect(toggles).toHaveLength(3);
    for (const toggle of toggles) {
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const controlled = toggle.getAttribute("aria-controls");
      expect(controlled).toBeTruthy();
      expect(container.querySelector(`[id="${controlled}"]`)).not.toBeNull();
    }
    // Each etapa group's rows are a tbody of their own.
    const [, presale] = toggles;
    expect(container.querySelector(`[id="${presale.getAttribute("aria-controls")}"]`)?.tagName).toBe("TBODY");
    // A native table per project with column headers; its editable cells make it a grid.
    const table = within(lomas).getByRole("grid");
    const headers = within(table)
      .getAllByRole("columnheader")
      .filter((h) => h.dataset.slot !== "row-actions-head" && h.dataset.slot !== "row-select-head");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Tarea",
      "Etapa",
      "Fase",
      "Responsable",
      "Apoyo",
      "Estatus",
      "Vence",
      "Prioridad",
      "Subtareas",
      "Días de retraso",
    ]);
    for (const h of headers) expect(h.getAttribute("scope")).toBe("col");
    // The live region that announces "Expandir todo" / "Contraer todo".
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("every column but Apoyo is a sort button with aria-sort (#1044)", () => {
    const onQuery = vi.fn();
    renderAnalitico(DEFAULT_TAREAS_QUERY, onQuery);
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    const headers = within(within(lomas).getByRole("grid"))
      .getAllByRole("columnheader")
      .filter((h) => h.dataset.slot !== "row-actions-head" && h.dataset.slot !== "row-select-head");
    const byLabel = new Map(headers.map((h) => [h.textContent, h]));
    expect(byLabel.get("Apoyo")?.hasAttribute("aria-sort")).toBe(false);
    // The default sort is "retraso" ascending.
    expect(byLabel.get("Días de retraso")?.getAttribute("aria-sort")).toBe("ascending");
    for (const label of ["Tarea", "Etapa", "Fase", "Responsable", "Estatus", "Vence", "Prioridad", "Subtareas"]) {
      const header = byLabel.get(label)!;
      expect(header.getAttribute("aria-sort")).toBe("none");
      // A native button: Enter and Space press it.
      const button = within(header).getByRole("button", { name: label });
      expect(button.getAttribute("type")).toBe("button");
    }
    fireEvent.click(within(byLabel.get("Vence")!).getByRole("button"));
    expect(onQuery).toHaveBeenCalledWith({ orden: { orderBy: "vence", orderDir: "asc" } });
    expect(screen.getByText("Por proyecto y etapa, ordenada por retraso.")).toBeTruthy();
  });

  it("the subtitle and aria-sort follow ?orden= (#1044)", () => {
    const onQuery = vi.fn();
    renderAnalitico({ ...DEFAULT_TAREAS_QUERY, orden: { orderBy: "vence", orderDir: "desc" } }, onQuery);
    expect(screen.getByText("Por proyecto y etapa, ordenada por vencimiento (más lejano primero).")).toBeTruthy();
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    const vence = within(within(lomas).getByRole("grid")).getByRole("columnheader", { name: "Vence" });
    expect(vence.getAttribute("aria-sort")).toBe("descending");
    // asc → desc → back to the default.
    fireEvent.click(within(vence).getByRole("button"));
    expect(onQuery).toHaveBeenCalledWith({ orden: null });
  });

  it("subtasks: a toggle with aria-expanded / aria-controls, nested rows announced as subtareas (#1048)", async () => {
    const { container } = renderAnalitico();
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    const toggle = within(lomas).getByRole("button", { name: "Subtareas de «Contrato»" });
    // Collapsed by default; only Contrato has subtasks.
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.hasAttribute("aria-controls")).toBe(false);
    expect(within(lomas).queryByRole("button", { name: "Subtareas de «Planos»" })).toBeNull();
    // The "2/5" chip says what it counts.
    expect(within(lomas).getByTitle("2 de 5 subtareas completadas").getAttribute("aria-hidden")).toBe("true");
    expect(within(lomas).getByRole("link", { name: "Contrato" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const nested = container.querySelectorAll('[data-slot="leaf-row"][data-depth="1"]');
    expect(nested).toHaveLength(1);
    expect(nested[0].textContent).toContain("subtarea de «Contrato»");
    const controlled = toggle.getAttribute("aria-controls")!;
    for (const id of controlled.split(" ")) expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    // A subtask has no toggle of its own; its row is in the same keyboard grid.
    expect(nested[0].querySelector('[data-slot="row-detail-toggle"]')).toBeNull();
    expect(nested[0].querySelector("[data-grid-cell]")).not.toBeNull();
    expect(await seriousViolations(container)).toEqual([]);
  });
});
