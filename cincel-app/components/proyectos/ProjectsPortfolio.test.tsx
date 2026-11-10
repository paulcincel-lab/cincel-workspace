// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";

import type { ListPageProps } from "@/components/patterns/ListPage";
import type { NewProjectDialogProps } from "./NewProjectDialog";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));
const submitProjectCreateAction = vi.hoisted(() => vi.fn());
const updateProjectAction = vi.hoisted(() => vi.fn(async () => undefined));
const captured = vi.hoisted(() => ({ list: null as ListPageProps | null, dialog: null as NewProjectDialogProps | null }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/projects-actions", () => ({ submitProjectCreateAction, updateProjectAction }));
// The page prefetches `qk.proyectos.list()`; a client call here would be a bug.
const pageData = vi.hoisted(() => ({ getProyectosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageData);
const catalog = vi.hoisted(() => ({
  fetchCatalogContacts: vi.fn(async () => [{ id: "c1", name: "Familia Gómez", type: "cliente" }]),
  fetchCatalogStaff: vi.fn(async () => [{ id: "s1", name: "Ana López" }]),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  ...catalog,
  fetchCatalogAssignableStaff: vi.fn(),
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogProjectSpaces: vi.fn(),
  fetchCatalogTaskStatuses: vi.fn(),
  fetchCatalogWorkflows: vi.fn(),
}));
vi.mock("@/lib/tramos/compat", () => ({
  tramoColorVar: (key: string) => `var(--chart-${key === "presale" ? 1 : key === "diseno" ? 2 : 3})`,
}));

// The pattern and the dialog have their own tests; here they expose what the
// page hands them, so the assertions are about the data and not the markup.
vi.mock("@/components/patterns/ListPage", () => ({
  ListPage: (props: ListPageProps) => {
    captured.list = props;
    const spec = props.spec.kind === "cards" ? props.spec : null;
    const isEmpty = spec ? spec.items.length === 0 : true;
    return (
      <main>
        <h1>{props.header.title}</h1>
        <p data-testid="description">{props.header.description}</p>
        <div data-testid="actions">{props.header.actions as ReactNode}</div>
        {props.filters as ReactNode}
        {isEmpty && props.empty ? (
          <div data-testid="empty">
            <span>{props.empty.title}</span>
            {props.empty.action ? (
              <button type="button" onClick={() => props.empty?.action?.onClick?.()}>
                {props.empty.action.label}
              </button>
            ) : null}
          </div>
        ) : (
          <ul data-testid="items">
            {spec?.items.map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
        )}
      </main>
    );
  },
}));
vi.mock("@/components/patterns/FiltersBar", () => ({
  FiltersBar: (props: { search?: { value: string; placeholder: string; onChange(v: string): void } }) =>
    props.search ? (
      <input
        aria-label={props.search.placeholder}
        value={props.search.value}
        onChange={(e) => props.search?.onChange(e.target.value)}
      />
    ) : null,
}));
// The Visual and Esencial layouts have their own tests; here they only show which one the Estilo picked.
const layouts = vi.hoisted(() => ({ onNewProject: null as (() => void) | null }));
vi.mock("@/components/widgets/ProjectsVisualLayout", () => ({
  ProjectsVisualLayout: (props: { onNewProject?(): void }) => {
    layouts.onNewProject = props.onNewProject ?? null;
    return <div data-testid="layout-visual" />;
  },
}));
vi.mock("@/components/widgets/ProjectsEsencialLayout", () => ({
  ProjectsEsencialLayout: (props: { onNewProject?(): void }) => {
    layouts.onNewProject = props.onNewProject ?? null;
    return <div data-testid="layout-esencial" />;
  },
}));
vi.mock("./NewProjectDialog", () => ({
  NewProjectDialog: (props: NewProjectDialogProps) => {
    captured.dialog = props;
    return props.open ? <div role="dialog" aria-label="Nuevo proyecto" /> : null;
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { proyectosPageOptions } from "@/lib/query/options/proyectos";
import { prefetch } from "@/lib/query/server";
import { createTestQueryClient, hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import { useProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";

import {
  CLEAR_TRAMO_LABEL,
  COLLAPSE_STRIP_LABEL,
  EXPAND_STRIP_LABEL,
  ProjectsPortfolio,
  SEARCH_DEBOUNCE_MS,
} from "./ProjectsPortfolio";
import { PORTFOLIO, PROJECTS, TRAMOS, portfolioPageData } from "./projects-portfolio.fixtures";
import {
  BUDGET_COLUMN_LABEL,
  NO_TRAMO_KEY,
  buildTramoSegments,
  filterByTramo,
  formatDeliveryDate,
  portfolioById,
  sparklineText,
  tramoSteps,
} from "./projects-portfolio-data";

/**
 * Renders the portfolio over a seeded `qk.proyectos.list()`, as the page's
 * hydration leaves it. Analítico by default: the `ListPage` branch.
 */
function renderPortfolio(patch: Partial<ProyectosPageData> = {}, style: PresentationStyle = "analitico") {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.list(), portfolioPageData(patch));
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <ProjectsPortfolio />
    </StyleProvider>,
    { client },
  );
}

function cardsSpec() {
  const spec = captured.list?.spec;
  if (!spec || spec.kind !== "cards") throw new Error("expected a cards spec");
  return spec;
}

/** The URL of the last `history.replaceState` call. */
function lastReplacedUrl(spy: { mock: { calls: unknown[][] } }): string | undefined {
  const call = spy.mock.calls.at(-1);
  return call ? String(call[2]) : undefined;
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  nav.replace.mockReset();
  submitProjectCreateAction.mockReset();
  updateProjectAction.mockClear();
  pageData.getProyectosPageData.mockReset();
  catalog.fetchCatalogContacts.mockClear();
  catalog.fetchCatalogStaff.mockClear();
  captured.list = null;
  captured.dialog = null;
  layouts.onNewProject = null;
  useProyectosDashboard.getState().reset();
  window.history.replaceState(null, "", "/proyectos");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ProjectsPortfolio", () => {
  it("lists active and paused projects with the header copy", () => {
    renderPortfolio();
    expect(screen.getByRole("heading", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByTestId("description").textContent).toBe("3 activos · avance, fase y entregas de cada obra.");
    expect(cardsSpec().items.map((i) => i.title)).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    expect(screen.queryByText("Casa Antigua")).toBeNull();
  });

  it("renders from the hydrated query with 0 client action calls", async () => {
    const { client, state } = await hydrationRoundtrip((server) =>
      prefetch(server, proyectosPageOptions(), async () => portfolioPageData()),
    );
    renderWithQueryClient(
      <StyleProvider style="analitico" scope="staff">
        <ProjectsPortfolio />
      </StyleProvider>,
      { client, hydrate: state },
    );
    expect(cardsSpec().items.map((i) => i.title)).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    expect(pageData.getProyectosPageData).not.toHaveBeenCalled();
    expect(submitProjectCreateAction).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogContacts).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();
  });

  it("renders the layout of the active Estilo (PageStyleLayout)", () => {
    renderPortfolio({}, "visual");
    expect(screen.getByTestId("layout-visual")).toBeTruthy();
    expect(captured.list).toBeNull();
    cleanup();
    renderPortfolio({}, "esencial");
    expect(screen.getByTestId("layout-esencial")).toBeTruthy();
    expect(captured.list).toBeNull();
    cleanup();
    renderPortfolio({}, "analitico");
    expect(screen.queryByTestId("layout-visual")).toBeNull();
    expect(cardsSpec().items).toHaveLength(3);
  });

  it("the Visual layout's Nuevo proyecto opens the create dialog", () => {
    renderPortfolio({}, "visual");
    act(() => layouts.onNewProject?.());
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
  });

  it("shows no chart/table view toggle (the Estilo picks the layout)", () => {
    renderPortfolio();
    expect(screen.queryByRole("group", { name: "Vista de proyectos" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Vista de Proyectos por tramo" })).toBeNull();
  });

  it("leaves the Presup. ejercido column out for non-admins", () => {
    renderPortfolio({ canSeeAdminData: false });
    const { table } = cardsSpec();
    expect(table.columns.map((c) => c.label)).not.toContain(BUDGET_COLUMN_LABEL);
    for (const row of table.rows) expect(row).not.toHaveProperty("presupuesto");
    expect(JSON.stringify(table)).not.toContain(BUDGET_COLUMN_LABEL);
  });

  it("adds the Presup. ejercido column for admins, Analítico only", () => {
    renderPortfolio({ canSeeAdminData: true, portfolio: PORTFOLIO });
    const { table } = cardsSpec();
    const column = table.columns.find((c) => c.label === BUDGET_COLUMN_LABEL);
    expect(column).toMatchObject({ key: "presupuesto", format: "percent", hideOn: ["visual", "esencial"] });
    expect(table.rows.find((r) => r.id === "p-lomas")?.presupuesto).toBe(55);
  });

  it("builds the Analítico portfolio columns and the totals row", () => {
    renderPortfolio();
    const { table } = cardsSpec();
    const analitico = table.columns.filter((c) => !c.hideOn?.includes("analitico")).map((c) => c.label);
    expect(analitico).toEqual([
      "Proyecto",
      "Tramo",
      "Real",
      "Plan",
      "Desv.",
      "Abiertas",
      "Vencidas",
      "Días a entrega",
      "Próxima entrega",
      "Tendencia",
    ]);
    const esencial = table.columns.filter((c) => !c.hideOn?.includes("esencial")).map((c) => c.label);
    expect(esencial).toEqual(["Proyecto", "Lugar", "Tramo", "Avance", "Próxima entrega"]);
    expect(table.totals).toMatchObject({ name: "Total (3)", abiertas: 12, vencidas: 2 });
  });

  it("shows the next delivery only from the portfolio row (never an admin task of the project)", () => {
    renderPortfolio();
    const { items, table } = cardsSpec();
    const lomas = items.find((i) => i.id === "p-lomas");
    expect(lomas?.meta).toContainEqual({ label: "Próxima entrega", value: "Plano de acabados · 12 nov" });
    expect(items.find((i) => i.id === "p-andares")?.meta).toContainEqual({ label: "Próxima entrega", value: "Sin entregas" });
    expect(table.rows.find((r) => r.id === "p-lomas")?.proxima).toBe("Plano de acabados · 12 nov");
    expect(lomas?.meta).toContainEqual({ label: "Tareas", value: "4 abiertas · 2 vencidas" });
  });

  it("uses the portfolio's real progress and falls back to the project's own", () => {
    renderPortfolio();
    const { items } = cardsSpec();
    expect(items.find((i) => i.id === "p-lomas")?.progress).toBe(62);
    expect(items.find((i) => i.id === "p-pausado")?.progress).toBe(0);
    expect(items.find((i) => i.id === "p-pausado")?.badges).toContainEqual({ label: "Pausado", tone: "warn" });
  });

  it("filters by the search box right away", () => {
    renderPortfolio();
    fireEvent.change(screen.getByLabelText("Buscar proyecto o lugar"), { target: { value: "zapopan" } });
    expect(cardsSpec().items.map((i) => i.title)).toEqual(["Depto Andares"]);
  });

  it("writes the search to ?q= with history.replaceState after the debounce, never router.push", () => {
    vi.useFakeTimers();
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderPortfolio();
    fireEvent.change(screen.getByLabelText("Buscar proyecto o lugar"), { target: { value: "zapo" } });
    fireEvent.change(screen.getByLabelText("Buscar proyecto o lugar"), { target: { value: "zapopan" } });
    expect(replaceState).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(lastReplacedUrl(replaceState)).toBe("/proyectos?q=zapopan");
    // Clearing the box drops the param.
    fireEvent.change(screen.getByLabelText("Buscar proyecto o lugar"), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(lastReplacedUrl(replaceState)).toBe("/proyectos");
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("restores the search from ?q= (back from a project)", () => {
    nav.params = new URLSearchParams("q=zapopan");
    renderPortfolio();
    expect((screen.getByLabelText("Buscar proyecto o lugar") as HTMLInputElement).value).toBe("zapopan");
    expect(cardsSpec().items.map((i) => i.title)).toEqual(["Depto Andares"]);
  });

  it("shows the empty state with the Nuevo proyecto action", () => {
    renderPortfolio({ projects: PROJECTS.filter((p) => p.status === "completado"), portfolio: [] });
    expect(captured.list?.empty?.title).toBe("Aún no hay proyectos");
    expect(captured.list?.empty?.action?.label).toBe("Nuevo proyecto");
    fireEvent.click(within(screen.getByTestId("empty")).getByRole("button", { name: "Nuevo proyecto" }));
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
  });

  it("hides every create entry point without projects.canCreateProject", () => {
    nav.params = new URLSearchParams("nuevo=1");
    renderPortfolio({ canCreateProject: false, projects: [] });
    expect(captured.list?.empty?.action).toBeUndefined();
    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens NewProjectDialog with ?nuevo=1 and drops the param with history.replaceState on close", () => {
    nav.params = new URLSearchParams("nuevo=1&estilo=esencial");
    window.history.replaceState(null, "", "/proyectos?nuevo=1&estilo=esencial");
    const replaceState = vi.spyOn(window.history, "replaceState");
    renderPortfolio();
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
    act(() => captured.dialog?.onOpenChange(false));
    expect(lastReplacedUrl(replaceState)).toBe("/proyectos?estilo=esencial");
    // No navigation: closing never renders the route on the server.
    expect(nav.replace).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never loads the admin options for non-admins", async () => {
    nav.params = new URLSearchParams("nuevo=1");
    renderPortfolio({ canSeeAdminData: false });
    expect(captured.dialog?.adminOptions).toBeNull();
    await act(async () => undefined);
    expect(catalog.fetchCatalogContacts).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();
  });

  it("loads the admin options lazily, only once the dialog opens, as {id, name}", async () => {
    renderPortfolio({ canSeeAdminData: true });
    await act(async () => undefined);
    expect(catalog.fetchCatalogContacts).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();

    fireEvent.click(within(screen.getByTestId("actions")).getByRole("button", { name: "Nuevo proyecto" }));
    await waitFor(() =>
      expect(captured.dialog?.adminOptions).toEqual({
        clients: [{ id: "c1", name: "Familia Gómez" }],
        staff: [{ id: "s1", name: "Ana López" }],
      }),
    );
    expect(catalog.fetchCatalogContacts).toHaveBeenCalledWith({ type: "cliente" });
    expect(catalog.fetchCatalogStaff).toHaveBeenCalledTimes(1);
  });

  it("creates the project through useActionMutation, invalidates the list and the project options, and opens it", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: true, project: { id: "p-new" } });
    const { client } = renderPortfolio();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(() => captured.dialog!.onConfirm({ name: "Casa Nueva" }));
    expect(submitProjectCreateAction).toHaveBeenCalledWith({ name: "Casa Nueva" });
    expect(updateProjectAction).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledWith("/proyectos/p-new");
    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(keys).toContainEqual(qk.proyectos.list());
      expect(keys).toContainEqual(qk.catalog.projectOptions());
      expect(keys).toContainEqual(qk.inicio());
    });
  });

  it("saves the admin client and origin right after the create and invalidates the project", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: true, project: { id: "p-new" } });
    updateProjectAction.mockResolvedValue({ ok: true, data: { id: "p-new" } } as never);
    const { client } = renderPortfolio({ canSeeAdminData: true });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const admin = { clientId: "c1", origin: "Recomendación", originStaffId: null };
    await act(() => captured.dialog!.onConfirm({ name: "Casa Nueva" }, admin));
    expect(updateProjectAction).toHaveBeenCalledWith("p-new", admin);
    expect(nav.push).toHaveBeenCalledWith("/proyectos/p-new");
    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
      expect(keys).toContainEqual(qk.proyectos.detail("p-new"));
      expect(keys).toContainEqual(qk.proyectos.tab("p-new", "clientes"));
    });
  });

  it("opens the ficha when the admin fields fail to save (an ActionResult error)", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: true, project: { id: "p-new" } });
    updateProjectAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" } as never);
    renderPortfolio({ canSeeAdminData: true });
    const admin = { clientId: "c1", origin: null, originStaffId: null };
    await act(() => captured.dialog!.onConfirm({ name: "Casa Nueva" }, admin));
    expect(nav.push).toHaveBeenCalledWith("/proyectos/p-new/ficha");
  });

  it("rethrows the create code so the dialog shows its copy", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: false, error: "NAME_TAKEN" });
    renderPortfolio();
    await expect(captured.dialog!.onConfirm({ name: "Casa Lomas" })).rejects.toThrow("NAME_TAKEN");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("turns a production-stripped error into the generic copy (empty code)", async () => {
    const stripped = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "123" });
    submitProjectCreateAction.mockRejectedValue(stripped);
    renderPortfolio();
    await expect(captured.dialog!.onConfirm({ name: "Casa Lomas" })).rejects.toThrow(/^$/);
  });
});

describe("ProjectsPortfolio dashboard interactions", () => {
  const dashboard = () => useProyectosDashboard.getState();
  const titles = () => cardsSpec().items.map((i) => i.title);
  const tableIds = () => cardsSpec().table.rows.map((r) => r.id);
  const stripRegion = () => document.querySelector("[data-slot=distribution-strip-toggles]");
  const segment = (name: RegExp) =>
    within(screen.getByRole("group", { name: "Filtrar: Proyectos por tramo" })).getByRole("button", { name });

  it("without any choice: no view handed to the widgets, the strip expanded, every project listed", () => {
    renderPortfolio();
    expect(cardsSpec().view).toBeUndefined();
    expect(titles()).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    expect(screen.getByRole("button", { name: COLLAPSE_STRIP_LABEL }).getAttribute("aria-expanded")).toBe("true");
  });

  it("a tramo segment is a toggle; it filters the cards, the table and the header count, and clears on a second press", () => {
    renderPortfolio();
    const diseno = segment(/Diseño/);
    expect(diseno.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(diseno);
    expect(segment(/Diseño/).getAttribute("aria-pressed")).toBe("true");
    expect(titles()).toEqual(["Casa Lomas"]);
    expect(tableIds()).toEqual(["p-lomas"]);
    expect(cardsSpec().table.totals).toMatchObject({ name: "Total (1)" });
    expect(screen.getByTestId("description").textContent).toBe("1 activo · avance, fase y entregas de cada obra.");
    // The strip keeps every tramo, so another one can be picked.
    expect(segment(/Presale/)).toBeTruthy();

    fireEvent.click(segment(/Diseño/));
    expect(dashboard().selectedKpi).toBeNull();
    expect(titles()).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    expect(screen.getByTestId("description").textContent).toBe("3 activos · avance, fase y entregas de cada obra.");
  });

  it("Analítico: the segment toggles under the table filter the portfolio table", () => {
    renderPortfolio({}, "analitico");
    const group = screen.getByRole("group", { name: "Filtrar: Proyectos por tramo" });
    fireEvent.click(within(group).getByRole("button", { name: /Presale/ }));
    expect(tableIds()).toEqual(["p-andares"]);
    expect(within(group).getByRole("button", { name: /Presale/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("selects Sin tramo for the projects without a tramo", () => {
    renderPortfolio();
    fireEvent.click(segment(/Sin tramo/));
    expect(dashboard().selectedKpi).toBe(NO_TRAMO_KEY);
    expect(titles()).toEqual(["Oficina Centro"]);
  });

  it("keeps a seeded selection (back from a project) and clears one whose tramo has no listed project", async () => {
    dashboard().selectKpi("presale");
    renderPortfolio();
    expect(titles()).toEqual(["Depto Andares"]);
    cleanup();

    // Construcción has no listed project in the loaded data.
    dashboard().selectKpi("construccion");
    renderPortfolio();
    expect(titles()).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    await waitFor(() => expect(dashboard().selectedKpi).toBeNull());
  });

  it("offers to drop the tramo when the search leaves it without results", () => {
    dashboard().selectKpi("diseno");
    renderPortfolio();
    fireEvent.change(screen.getByLabelText("Buscar proyecto o lugar"), { target: { value: "zapopan" } });
    expect(titles()).toEqual([]);
    expect(captured.list?.empty?.title).toBe("Sin resultados");
    expect(captured.list?.empty?.action?.label).toBe(CLEAR_TRAMO_LABEL);
    act(() => captured.list?.empty?.action?.onClick?.());
    expect(dashboard().selectedKpi).toBeNull();
    expect(titles()).toEqual(["Depto Andares"]);
  });

  it("collapses the strip (aria-expanded) and keeps the choice in the store", () => {
    renderPortfolio();
    expect(stripRegion()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: COLLAPSE_STRIP_LABEL }));
    expect(stripRegion()).toBeNull();
    const expand = screen.getByRole("button", { name: EXPAND_STRIP_LABEL });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(dashboard().collapsed.tramoStrip).toBe(true);
    // The cards stay.
    expect(titles()).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    fireEvent.click(expand);
    expect(stripRegion()).toBeTruthy();
  });

  it("renders a seeded collapsed strip collapsed", () => {
    dashboard().setCollapsed("tramoStrip", true);
    renderPortfolio();
    expect(stripRegion()).toBeNull();
    expect(screen.getByRole("button", { name: EXPAND_STRIP_LABEL })).toBeTruthy();
  });

  it("shows no range or series control", () => {
    renderPortfolio();
    expect(screen.queryByText(/\b(4|8|12) ?(sem|w)\b/i)).toBeNull();
    expect(screen.queryByRole("group", { name: /rango|serie/i })).toBeNull();
  });

  it("store changes cause no server call", () => {
    renderPortfolio();
    fireEvent.click(segment(/Diseño/));
    fireEvent.click(screen.getByRole("button", { name: COLLAPSE_STRIP_LABEL }));
    expect(pageData.getProyectosPageData).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogContacts).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("the server render equals the first client render with a persisted value present; it applies after mount", async () => {
    const html = () => {
      const client = createTestQueryClient();
      client.setQueryData(qk.proyectos.list(), portfolioPageData());
      return renderToString(
        <QueryClientProvider client={client}>
          <StyleProvider style="analitico" scope="staff">
            <ProjectsPortfolio />
          </StyleProvider>
        </QueryClientProvider>,
      );
    };
    const withoutValue = html();
    localStorage.setItem(
      "cincel.ui.dashboard.proyectos.v2",
      JSON.stringify({
        state: { range: "8w", collapsed: { tramoStrip: true }, views: {}, hiddenSeries: {} },
        version: 1,
      }),
    );
    // skipHydration: nothing is read from storage before the hydrator runs.
    expect(html()).toBe(withoutValue);
    expect(dashboard().collapsed).toEqual({});

    await act(async () => {
      await useProyectosDashboard.persist.rehydrate();
    });
    renderPortfolio();
    expect(stripRegion()).toBeNull();
    expect(cardsSpec().view).toBeUndefined();
  });
});

describe("projects portfolio data", () => {
  it("filters by the current tramo, Sin tramo included; null keeps every project", () => {
    const listed = PROJECTS.filter((p) => p.status !== "completado");
    expect(filterByTramo(listed, "diseno").map((p) => p.id)).toEqual(["p-lomas"]);
    expect(filterByTramo(listed, "presale").map((p) => p.id)).toEqual(["p-andares"]);
    expect(filterByTramo(listed, NO_TRAMO_KEY).map((p) => p.id)).toEqual(["p-pausado"]);
    expect(filterByTramo(listed, "construccion")).toEqual([]);
    expect(filterByTramo(listed, null)).toBe(listed);
  });

  it("formats delivery dates in lowercase es-MX", () => {
    expect(formatDeliveryDate("2026-11-12")).toBe("12 nov");
  });

  it("draws a text sparkline", () => {
    expect(sparklineText([1, 2, 3])).toBe("▁▅█");
    expect(sparklineText([4, 4])).toBe("▁▁");
    expect(sparklineText([])).toBeNull();
  });

  it("counts projects per tramo in tramo order, plus Sin tramo", () => {
    const listed = PROJECTS.filter((p) => p.status !== "completado");
    const segments = buildTramoSegments(listed, portfolioById(PORTFOLIO), TRAMOS);
    expect(segments.map((s) => [s.label, s.value])).toEqual([
      ["Presale", 1],
      ["Diseño", 1],
      ["Construcción", 0],
      ["Sin tramo", 1],
    ]);
    expect(segments[1]).toMatchObject({ colorVar: "var(--chart-2)", extra: { abiertas: 4, vencidas: 2, avance: "62%" } });
  });

  it("marks each tramo done, current or next", () => {
    expect(tramoSteps(PROJECTS[0], TRAMOS).map((s) => s.state)).toEqual(["done", "current", "next"]);
    expect(tramoSteps(PROJECTS[2], TRAMOS).map((s) => s.state)).toEqual(["next", "next", "next"]);
  });
});
