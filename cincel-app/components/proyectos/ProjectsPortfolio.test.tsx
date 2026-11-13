// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen, waitFor } from "@testing-library/react";

import type { NewProjectDialogProps } from "./NewProjectDialog";

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
  replace: vi.fn(),
}));
const submitProjectCreateAction = vi.hoisted(() => vi.fn());
const updateProjectAction = vi.hoisted(() => vi.fn(async () => undefined));
const captured = vi.hoisted(() => ({ dialog: null as NewProjectDialogProps | null }));

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

// Each layout and the dialog have their own tests; here the layouts only show which one the Estilo picked
// and hand over their "Nuevo proyecto" callback.
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
vi.mock("@/components/widgets/ProjectsAnaliticoLayout", () => ({
  ProjectsAnaliticoLayout: (props: { onNewProject?(): void }) => {
    layouts.onNewProject = props.onNewProject ?? null;
    return <div data-testid="layout-analitico" />;
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

import { ProjectsPortfolio } from "./ProjectsPortfolio";
import { PORTFOLIO, PROJECTS, TRAMOS, portfolioPageData } from "./projects-portfolio.fixtures";
import {
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
 * hydration leaves it. Analítico by default.
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
  // The create invalidates the list, so the refetch needs page data (a query function never resolves to undefined).
  pageData.getProyectosPageData.mockReset().mockResolvedValue(portfolioPageData());
  catalog.fetchCatalogContacts.mockClear();
  catalog.fetchCatalogStaff.mockClear();
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
    expect(screen.getByTestId("layout-analitico")).toBeTruthy();
    expect(pageData.getProyectosPageData).not.toHaveBeenCalled();
    expect(submitProjectCreateAction).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogContacts).not.toHaveBeenCalled();
    expect(catalog.fetchCatalogStaff).not.toHaveBeenCalled();
  });

  it("renders the layout of the active Estilo (PageStyleLayout)", () => {
    renderPortfolio({}, "visual");
    expect(screen.getByTestId("layout-visual")).toBeTruthy();
    cleanup();
    renderPortfolio({}, "esencial");
    expect(screen.getByTestId("layout-esencial")).toBeTruthy();
    cleanup();
    renderPortfolio({}, "analitico");
    expect(screen.getByTestId("layout-analitico")).toBeTruthy();
    expect(screen.queryByTestId("layout-visual")).toBeNull();
  });

  it.each(["visual", "esencial", "analitico"] as const)("the %s layout's Nuevo proyecto opens the create dialog", (style) => {
    renderPortfolio({}, style);
    act(() => layouts.onNewProject?.());
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
  });

  it("hides the dialog without projects.canCreateProject, even with ?nuevo=1", () => {
    nav.params = new URLSearchParams("nuevo=1");
    renderPortfolio({ canCreateProject: false, projects: [] });
    act(() => layouts.onNewProject?.());
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

    act(() => layouts.onNewProject?.());
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

describe("projects portfolio data", () => {
  it("filters by the current etapa, Sin etapa included; null keeps every project", () => {
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

  it("counts projects per etapa in etapa order, plus Sin etapa", () => {
    const listed = PROJECTS.filter((p) => p.status !== "completado");
    const segments = buildTramoSegments(listed, portfolioById(PORTFOLIO), TRAMOS);
    expect(segments.map((s) => [s.label, s.value])).toEqual([
      ["Presale", 1],
      ["Diseño", 1],
      ["Construcción", 0],
      ["Sin etapa", 1],
    ]);
    expect(segments[1]).toMatchObject({ colorVar: "var(--chart-2)", extra: { abiertas: 4, vencidas: 2, avance: "62%" } });
  });

  it("marks each etapa done, current or next", () => {
    expect(tramoSteps(PROJECTS[0], TRAMOS).map((s) => s.state)).toEqual(["done", "current", "next"]);
    expect(tramoSteps(PROJECTS[2], TRAMOS).map((s) => s.state)).toEqual(["next", "next", "next"]);
  });
});
