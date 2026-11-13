// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
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

const pageData = vi.hoisted(() => ({
  getTareasPageData: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasSummary: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => pageData);

// The page bundle is in (it seeded the keys below).
vi.mock("./use-tareas-page", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-tareas-page")>()),
  useTareasPageReady: () => true,
}));

vi.mock("@/components/shell/PageHeader", () => ({
  PageHeader: ({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) => (
    <header>
      <h1>{title}</h1>
      {description ? <p data-testid="page-description">{description}</p> : null}
      {actions}
    </header>
  ),
}));

// The quick-add line itself is covered by `QuickAddRow.test.tsx`: here it shows the context it got.
type QuickAddProps = import("@/components/widgets/QuickAddRow").QuickAddRowProps;
const quickAddRows = vi.hoisted(() => [] as QuickAddProps[]);
vi.mock("@/components/widgets/QuickAddRow", () => ({
  QuickAddRow: (props: QuickAddProps) => {
    quickAddRows.push(props);
    return (
      <tr data-testid="quick-add" data-project={props.context.projectId ?? ""} data-tramo={props.context.tramoId ?? ""}>
        <td colSpan={props.colSpan}>
          <button type="button" onClick={() => void props.onCreate({ title: "Nueva", projectId: props.context.projectId, tramoId: props.context.tramoId ?? null, assigneeId: null, dueDate: null, priority: "media" })}>
            {props.context.label}
          </button>
        </td>
      </tr>
    );
  },
}));
const quickAdd = vi.hoisted(() => ({ create: vi.fn(), undo: vi.fn() }));
vi.mock("./quick-add-create", () => ({ useQuickAddCreate: () => quickAdd }));

import { TareasAnalitico } from "./TareasAnalitico";
import { hiddenProjectsNote } from "./tareas-analitico";
import {
  ANALITICO_FACETS,
  ANALITICO_LATE_SUMMARY,
  ANALITICO_SUMMARY,
  ANALITICO_TRAMOS,
  seedAnalitico,
} from "./fixtures/analitico-summary";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetTareasUi } from "@/lib/stores/tareas-ui-store";
import { parseTareasQuery } from "@/lib/tareas/query";

const onQuery = vi.fn();

function renderAnalitico(search = "", { canCreate = true } = {}) {
  nav.search = search;
  const query = parseTareasQuery(new URLSearchParams(search));
  const client = createTestQueryClient();
  const f = tareasListFiltersOf(query);
  seedAnalitico(client, f, query.mostrar === "en_retraso" ? ANALITICO_LATE_SUMMARY : ANALITICO_SUMMARY);
  const view = renderWithQueryClient(
    <TareasAnalitico
      query={query}
      facets={ANALITICO_FACETS}
      tramos={ANALITICO_TRAMOS}
      staff={[{ id: "s1", name: "Ana Ruiz" }]}
      actions={null}
      search=""
      onSearch={vi.fn()}
      onQuery={onQuery}
      empty={{ title: "No hay tareas con estos filtros" }}
      canCreate={canCreate}
    />,
    { client },
  );
  return { ...view, client };
}

function kpis(container: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of container.querySelectorAll<HTMLElement>("[data-kpi]")) {
    out[el.querySelector("dt")?.textContent ?? ""] = el.querySelector('[data-slot="kpi-value"]')?.textContent ?? "";
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T18:00:00Z"));
  resetTareasUi();
  quickAddRows.length = 0;
  onQuery.mockReset();
  quickAdd.create.mockReset();
  pageData.getTareasSummary.mockResolvedValue(ANALITICO_SUMMARY);
  pageData.getTareasListPage.mockResolvedValue({ rows: [], nextCursor: null, total: 0 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("TareasAnalitico", () => {
  it("KPI sets for todas and en_retraso", () => {
    const { container } = renderAnalitico();
    expect(kpis(container)).toEqual({
      Proyectos: "2",
      Abiertas: "4",
      Vencidas: "3",
      "% vencidas": "75 %",
      "Retraso promedio": "6.3 d",
    });
    expect(screen.getByTestId("page-description").textContent).toBe("Por proyecto y etapa, ordenada por retraso.");
    expect(container.querySelector('[data-slot="tareas-totals"]')?.textContent).toBe(
      "Total · 5 tareas en 2 proyectos4 abiertas · 3 vencidas · 75 % · 6.3 d",
    );
    cleanup();

    const late = renderAnalitico("mostrar=en_retraso");
    expect(kpis(late.container)).toEqual({
      Proyectos: "1de 3",
      "Tareas mostradas": "3de 7",
      Vencidas: "3",
      Bloqueadas: "1",
      "Retraso promedio": "6.3 d",
    });
    expect(late.container.querySelector('[data-slot="tareas-totals"]')?.textContent).toBe(
      "Total · 3 vencidas en 1 proyecto19 días de retraso · 6.3 d promedio",
    );
    // Header and tramo captions say how many of all.
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    expect(lomas.textContent).toContain("3 de 4 tareas · 2 etapas");
    expect(lomas.textContent).toContain("1 de 2 tareas");
  });

  it("Ir a focuses the project", async () => {
    renderAnalitico();
    const anchors = screen.getByRole("navigation", { name: "Ir a" });
    const link = within(anchors).getByText("Depto Roma").closest("a")!;
    fireEvent.click(link);
    const section = screen.getByRole("region", { name: "Depto Roma" });
    const header = within(section).getAllByRole("button")[0];
    await waitFor(() => expect(document.activeElement).toBe(header));
    expect(header.getAttribute("aria-expanded")).toBe("true");
    // The overdue count per project, destructive only when there are some.
    expect(within(anchors).getByText("3").className).toContain("text-destructive");
    expect(within(anchors).getByText("0").className).toContain("text-muted-foreground");
  });

  it("expand all and collapse all", async () => {
    renderAnalitico();
    const headers = () => screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-expanded") && !b.closest('[data-slot="row-actions-cell"]') && !b.closest('[data-slot="filter-card"]') && b.dataset.slot !== "row-detail-toggle");
    expect(headers()).toHaveLength(5);
    expect(headers().every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    await waitFor(() => expect(screen.getByText("Se contrajeron 5 grupos")).toBeTruthy());
    // Collapsed projects hide their tramo groups: only the two project headers remain.
    expect(headers().every((b) => b.getAttribute("aria-expanded") === "false")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Expandir todo" }));
    await waitFor(() => expect(screen.getByText("Se expandieron 5 grupos")).toBeTruthy());
    expect(headers().every((b) => b.getAttribute("aria-expanded") === "true")).toBe(true);

    // One group on its own.
    const roma = screen.getByRole("region", { name: "Depto Roma" });
    const romaHeader = within(roma).getAllByRole("button")[0];
    fireEvent.click(romaHeader);
    expect(romaHeader.getAttribute("aria-expanded")).toBe("false");
  });

  it("hidden-projects note pluralizes", () => {
    expect(
      hiddenProjectsNote({
        ...ANALITICO_LATE_SUMMARY,
        unfiltered: { ...ANALITICO_LATE_SUMMARY.unfiltered, projectList: ANALITICO_LATE_SUMMARY.unfiltered.projectList!.slice(0, 2) },
      }),
    ).toBe(
      "1 proyecto sin tareas vencidas no se muestra: Casa Valle de Bravo. Las etapas sin vencidas también se ocultan.",
    );
    renderAnalitico("mostrar=en_retraso");
    expect(document.querySelector('[data-slot="hidden-projects"]')?.textContent).toBe(
      "2 proyectos sin tareas vencidas no se muestran: Casa Valle de Bravo, Depto Roma. Las etapas sin vencidas también se ocultan.",
    );
    cleanup();
    renderAnalitico();
    expect(document.querySelector('[data-slot="hidden-projects"]')).toBeNull();
  });

  it("quick-add row only outside en_retraso", async () => {
    quickAdd.create.mockResolvedValue({ id: "t9", title: "Nueva" });
    renderAnalitico();
    const rows = screen.getAllByTestId("quick-add");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => `${r.dataset.project}/${r.dataset.tramo}`)).toEqual(["p1/w-presale", "p1/w-diseno", "p2/w-diseno"]);
    expect(quickAddRows.at(-1)?.variant).toBe("row");
    expect(quickAddRows.at(-1)?.context.placeholder).toBe("Nueva tarea en Diseño…");
    // The project and tramo come from the group.
    await act(async () => {
      fireEvent.click(within(rows[0]).getByRole("button"));
    });
    expect(quickAdd.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p1", tramoId: "w-presale" }));
    cleanup();

    renderAnalitico("mostrar=en_retraso");
    expect(screen.queryAllByTestId("quick-add")).toHaveLength(0);
    cleanup();

    renderAnalitico("", { canCreate: false });
    expect(screen.queryAllByTestId("quick-add")).toHaveLength(0);
  });

  it("heat classes at 5 and 10", () => {
    const { container } = renderAnalitico();
    const cell = (id: string) => container.querySelector(`[data-row-id="${id}"] [data-column="diasRetraso"]`) as HTMLElement;
    expect(cell("t1").dataset.heat).toBe("crit");
    expect(cell("t1").className).toContain("bg-tint-destructive");
    expect(cell("t3").dataset.heat).toBe("warn");
    expect(cell("t3").className).toContain("bg-tint-warning");
    expect(cell("t4").dataset.heat).toBeUndefined();
    // The days are said in words too, not by color alone.
    expect(cell("t1").textContent).toContain("10 días de retraso");
    // Closed and on-time tasks have no delay.
    expect(cell("t2").textContent).toBe("—");
    // Overdue due dates in destructive.
    expect(container.querySelector('[data-row-id="t1"] [data-column="vence"] .text-destructive')?.textContent).toBeTruthy();
    // Rows in the order they came: days late desc.
    const lomas = screen.getByRole("region", { name: "Casa Lomas" });
    expect([...lomas.querySelectorAll("[data-row-id]")].map((r) => r.getAttribute("data-row-id"))).toEqual(["t1", "t2", "t3", "t4"]);
  });

  it("row opens ?tarea=", () => {
    renderAnalitico("etapa=presale");
    const link = screen.getByRole("link", { name: "Contrato" });
    expect(link.getAttribute("href")).toBe("/tareas?etapa=presale&tarea=t1");
  });

  it("writes the Mostrar and Etapa filters to the URL", () => {
    renderAnalitico();
    const mostrar = screen.getByRole("radiogroup", { name: "Mostrar" });
    expect(within(mostrar).getAllByRole("radio").map((r) => r.textContent)).toEqual(["Todas7", "Abiertas6", "En retraso3"]);
    fireEvent.click(within(mostrar).getByRole("radio", { name: /En retraso/ }));
    expect(onQuery).toHaveBeenCalledWith({ mostrar: "en_retraso" });
    const tramo = screen.getByRole("radiogroup", { name: "Etapa" });
    fireEvent.click(within(tramo).getByRole("radio", { name: /Presale/ }));
    expect(onQuery).toHaveBeenCalledWith({ tramo: "presale" });
    fireEvent.click(within(tramo).getByRole("radio", { name: /Todos/ }));
    expect(screen.getByRole("searchbox", { name: "Buscar tareas" })).toBeTruthy();
  });

  it("empty states: filters and en retraso", () => {
    pageData.getTareasSummary.mockResolvedValue({ ...ANALITICO_SUMMARY, projects: [] });
    const query = parseTareasQuery(new URLSearchParams("mostrar=en_retraso"));
    const client = createTestQueryClient();
    const f = tareasListFiltersOf(query);
    client.setQueryData(qk.tareas.summary(f), {
      projects: [],
      totals: { total: 0, open: 0, overdue: 0, blocked: 0, daysLateSum: 0, projects: 0 },
      unfiltered: { projects: 2, total: 5, projectList: [] },
    });
    nav.search = "mostrar=en_retraso";
    renderWithQueryClient(
      <TareasAnalitico
        query={query}
        facets={ANALITICO_FACETS}
        tramos={ANALITICO_TRAMOS}
        staff={[]}
        actions={null}
        search=""
        onSearch={vi.fn()}
        onQuery={onQuery}
        empty={{ title: "No hay tareas con estos filtros", action: { label: "Quitar filtros", href: "/tareas" } }}
        canCreate
      />,
      { client },
    );
    expect(screen.getByText("No hay tareas en retraso")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Quitar filtros" })).toBeTruthy();
  });
});
