// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

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
vi.mock("./NewProjectDialog", () => ({
  NewProjectDialog: (props: NewProjectDialogProps) => {
    captured.dialog = props;
    return props.open ? <div role="dialog" aria-label="Nuevo proyecto" /> : null;
  },
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";

import { ProjectsPortfolio, type ProjectsPortfolioProps } from "./ProjectsPortfolio";
import { PORTFOLIO, PORTFOLIO_NON_ADMIN, PROJECTS, TRAMOS } from "./projects-portfolio.fixtures";
import {
  BUDGET_COLUMN_LABEL,
  buildTramoSegments,
  formatDeliveryDate,
  portfolioById,
  sparklineText,
  tramoSteps,
} from "./projects-portfolio-data";

function renderPortfolio(patch: Partial<ProjectsPortfolioProps> = {}, style: PresentationStyle = "visual") {
  return render(
    <StyleProvider style={style} scope="staff">
      <ProjectsPortfolio
        projects={PROJECTS}
        portfolio={PORTFOLIO_NON_ADMIN}
        tramos={TRAMOS}
        canCreateProject
        {...patch}
      />
    </StyleProvider>,
  );
}

function cardsSpec() {
  const spec = captured.list?.spec;
  if (!spec || spec.kind !== "cards") throw new Error("expected a cards spec");
  return spec;
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  nav.replace.mockReset();
  submitProjectCreateAction.mockReset();
  updateProjectAction.mockClear();
  captured.list = null;
  captured.dialog = null;
});

afterEach(() => cleanup());

describe("ProjectsPortfolio", () => {
  it("lists active and paused projects with the header copy", () => {
    renderPortfolio();
    expect(screen.getByRole("heading", { name: "Proyectos" })).toBeTruthy();
    expect(screen.getByTestId("description").textContent).toBe("3 activos · avance, fase y entregas de cada obra.");
    expect(cardsSpec().items.map((i) => i.title)).toEqual(["Casa Lomas", "Depto Andares", "Oficina Centro"]);
    expect(screen.queryByText("Casa Antigua")).toBeNull();
  });

  it("hands the same data to every style (the widgets decide the look)", () => {
    const snapshots = (["visual", "esencial", "analitico"] as const).map((style) => {
      renderPortfolio({}, style);
      const spec = cardsSpec();
      const snapshot = JSON.stringify({ items: spec.items, table: spec.table, header: captured.list?.header.description });
      cleanup();
      return snapshot;
    });
    expect(snapshots[1]).toBe(snapshots[0]);
    expect(snapshots[2]).toBe(snapshots[0]);
  });

  it("leaves the Presup. ejercido column out for non-admins", () => {
    renderPortfolio({ canSeeAdminData: false, portfolio: PORTFOLIO_NON_ADMIN });
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

  it("filters by the search box", () => {
    renderPortfolio();
    fireEvent.change(screen.getByLabelText("Buscar proyecto o lugar"), { target: { value: "zapopan" } });
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

  it("opens NewProjectDialog with ?nuevo=1 and drops the param on close", () => {
    nav.params = new URLSearchParams("nuevo=1&estilo=esencial");
    renderPortfolio();
    expect(screen.getByRole("dialog", { name: "Nuevo proyecto" })).toBeTruthy();
    act(() => captured.dialog?.onOpenChange(false));
    expect(nav.replace).toHaveBeenCalledWith("/proyectos?estilo=esencial", { scroll: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("passes the admin fields only to admins", () => {
    const adminOptions = { clients: [{ id: "c1", name: "Familia Gómez" }], staff: [] };
    renderPortfolio({ canSeeAdminData: false, adminOptions });
    expect(captured.dialog?.adminOptions).toBeNull();
    cleanup();
    renderPortfolio({ canSeeAdminData: true, adminOptions });
    expect(captured.dialog?.adminOptions).toEqual(adminOptions);
  });

  it("creates the project and opens it", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: true, project: { id: "p-new" } });
    renderPortfolio();
    await act(() => captured.dialog!.onConfirm({ name: "Casa Nueva" }));
    expect(submitProjectCreateAction).toHaveBeenCalledWith({ name: "Casa Nueva" });
    expect(updateProjectAction).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledWith("/proyectos/p-new");
  });

  it("saves the admin client and origin right after the create", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: true, project: { id: "p-new" } });
    renderPortfolio({ canSeeAdminData: true, adminOptions: { clients: [], staff: [] } });
    const admin = { clientId: "c1", origin: "Recomendación", originStaffId: null };
    await act(() => captured.dialog!.onConfirm({ name: "Casa Nueva" }, admin));
    expect(updateProjectAction).toHaveBeenCalledWith("p-new", admin);
    expect(nav.push).toHaveBeenCalledWith("/proyectos/p-new");
  });

  it("rethrows the create code so the dialog shows its copy", async () => {
    submitProjectCreateAction.mockResolvedValue({ ok: false, error: "NAME_TAKEN" });
    renderPortfolio();
    await expect(captured.dialog!.onConfirm({ name: "Casa Lomas" })).rejects.toThrow("NAME_TAKEN");
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("projects portfolio data", () => {
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
