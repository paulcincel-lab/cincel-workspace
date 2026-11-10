// @vitest-environment happy-dom
import { act, cleanup, screen, within } from "@testing-library/react";
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
import { ANALITICO_FACETS, ANALITICO_SUMMARY, ANALITICO_TRAMOS, seedAnalitico } from "./fixtures/analitico-summary";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { tareasListFiltersOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetTareasUi } from "@/lib/stores/tareas-ui-store";
import { DEFAULT_TAREAS_QUERY } from "@/lib/tareas/query";

function renderAnalitico() {
  const client = createTestQueryClient();
  seedAnalitico(client, tareasListFiltersOf(DEFAULT_TAREAS_QUERY), ANALITICO_SUMMARY);
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <TareasAnalitico
        query={DEFAULT_TAREAS_QUERY}
        facets={ANALITICO_FACETS}
        tramos={ANALITICO_TRAMOS}
        staff={[{ id: "s1", name: "Ana Ruiz" }]}
        actions={null}
        search=""
        onSearch={vi.fn()}
        onQuery={vi.fn()}
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
      .filter((b) => b.hasAttribute("aria-expanded"));
    // The project header and one button per tramo group.
    expect(toggles).toHaveLength(3);
    for (const toggle of toggles) {
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      const controlled = toggle.getAttribute("aria-controls");
      expect(controlled).toBeTruthy();
      expect(container.querySelector(`[id="${controlled}"]`)).not.toBeNull();
    }
    // Each tramo group's rows are a tbody of their own.
    const [, presale] = toggles;
    expect(container.querySelector(`[id="${presale.getAttribute("aria-controls")}"]`)?.tagName).toBe("TBODY");
    // A native table per project with column headers; its editable cells make it a grid.
    const table = within(lomas).getByRole("grid");
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Tarea",
      "Tramo",
      "Fase",
      "Responsable",
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
});
