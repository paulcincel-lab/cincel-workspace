// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
const actions = vi.hoisted(() => ({ setProjectCurrentTramoAction: vi.fn() }));
const pageData = vi.hoisted(() => ({ getProyectosPageData: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/actions/projects-actions", () => actions);
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageData);
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
vi.mock("@/lib/tramos/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    canSeeAdminData: () => false,
    listTramos: async () => [],
    tramoLabel: (key: string) => key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

import { PORTFOLIO, PROJECTS, TRAMOS, portfolioPageData } from "@/components/proyectos/projects-portfolio.fixtures";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { ProjectsVisualLayout } from "@/components/widgets/ProjectsVisualLayout";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";

function renderLayout(patch: Partial<ProyectosPageData> = {}, onNewProject?: () => void) {
  const client = createTestQueryClient();
  const data = portfolioPageData({ portfolio: PORTFOLIO, ...patch });
  client.setQueryData(qk.proyectos.list(), data);
  pageData.getProyectosPageData.mockImplementation(async () => client.getQueryData(qk.proyectos.list()) ?? data);
  const view = renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <ProjectsVisualLayout onNewProject={onNewProject} />
    </StyleProvider>,
    { client },
  );
  return { ...view, client };
}

function column(container: HTMLElement, key: string): HTMLElement {
  return container.querySelector<HTMLElement>(`[data-slot="board-column"][data-column="${key}"]`)!;
}

function boardCard(container: HTMLElement, id: string): HTMLAnchorElement {
  return container.querySelector<HTMLAnchorElement>(`[data-slot="board-card"][data-project="${id}"]`)!;
}

/** A DataTransfer stand-in for happy-dom drag events. */
function dataTransfer() {
  const store = new Map<string, string>();
  return { setData: (k: string, v: string) => store.set(k, v), getData: (k: string) => store.get(k) ?? "", dropEffect: "move", effectAllowed: "move" };
}

function pointerDrag(card: HTMLElement, target: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(card, { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragEnd(card, { dataTransfer: transfer });
}

beforeEach(() => {
  resetProyectosDashboard();
  actions.setProjectCurrentTramoAction.mockReset();
  toasts.error.mockReset();
});

afterEach(() => {
  cleanup();
  nav.params = new URLSearchParams();
});

describe("ProjectsVisualLayout", () => {
  it("renders the five sections in order", () => {
    const { container } = renderLayout();
    expect(screen.getByRole("heading", { name: "Proyectos" })).toBeTruthy();
    // Two active projects (the paused one is reachable from Analítico) in two tramos; Casa Lomas delivers on day 2.
    expect(screen.getByText("2 obras activas en 2 tramos · 1 entrega en los próximos 11 días.")).toBeTruthy();
    const sections = [...container.querySelectorAll<HTMLElement>("[data-section], [data-slot=delivery-timeline]")].map(
      (el) => el.dataset.section ?? el.dataset.slot,
    );
    expect(sections).toEqual(["summary", "attention", "board", "delivery-timeline"]);
    expect(screen.getByRole("region", { name: "Portafolio por tramo" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Requieren atención" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver todos →" }).getAttribute("href")).toBe(
      "/proyectos?estilo=analitico&mostrar=vencidas",
    );
    expect(screen.getByRole("heading", { name: "Tablero del portafolio" })).toBeTruthy();
    expect(screen.getByText("Arrastra un proyecto para moverlo de tramo")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Próximas entregas" })).toBeTruthy();
    expect(screen.getByText("10 – 20 NOV")).toBeTruthy();
    // Only Casa Lomas has overdue tasks.
    const attention = container.querySelectorAll('[data-slot="attention-card"]');
    expect([...attention].map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-lomas"]);
    // No budget in Visual.
    expect(container.textContent).not.toContain("Presup");
  });

  it("hides Requieren atención when no project has overdue tasks", () => {
    renderLayout({ portfolio: PORTFOLIO.map((row) => ({ ...row, overdue: 0 })) });
    expect(screen.queryByRole("heading", { name: "Requieren atención" })).toBeNull();
  });

  it("tramo card toggles the board filter", () => {
    const { container } = renderLayout();
    const summary = screen.getByRole("region", { name: "Portafolio por tramo" });
    const diseno = within(summary).getByRole("button", { name: /Diseño/ });
    expect(diseno.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelectorAll('[data-slot="board-column"]')).toHaveLength(3);

    fireEvent.click(diseno);
    expect(diseno.getAttribute("aria-pressed")).toBe("true");
    const columns = [...container.querySelectorAll<HTMLElement>('[data-slot="board-column"]')].map((c) => c.dataset.column);
    expect(columns).toEqual(["diseno"]);
    // The timeline keeps Diseño's delivery (Casa Lomas).
    expect(within(container.querySelector<HTMLElement>('[data-slot="delivery-timeline"]')!).getByText("Plano de acabados")).toBeTruthy();

    // Construcción has no project: its column says so, and so does the timeline.
    fireEvent.click(within(summary).getByRole("button", { name: /Construcción/ }));
    expect(within(column(container, "construccion")).getByText("Sin proyectos")).toBeTruthy();
    expect(screen.getByText("Sin entregas en estos días")).toBeTruthy();

    fireEvent.click(within(summary).getByRole("button", { name: /Construcción/ }));
    expect(container.querySelectorAll('[data-slot="board-column"]')).toHaveLength(3);
  });

  it("summary totals equal the board's counts", () => {
    const { container } = renderLayout();
    const summary = screen.getByRole("region", { name: "Portafolio por tramo" });
    expect(within(summary).getByRole("button", { name: /Diseño/ }).textContent).toContain("1 proyecto");
    expect(within(column(container, "diseno")).getAllByRole("link")).toHaveLength(1);
    expect(within(summary).getByRole("button", { name: /Presale/ }).textContent).toContain("8tareas abiertas");
  });

  it("drag moves a project and calls setProjectCurrentTramoAction", async () => {
    let resolve!: (value: unknown) => void;
    actions.setProjectCurrentTramoAction.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { container, client } = renderLayout();
    pointerDrag(boardCard(container, "p-lomas"), column(container, "construccion"));

    await waitFor(() => expect(actions.setProjectCurrentTramoAction).toHaveBeenCalledWith("p-lomas", "w3"));
    // Optimistic: the card is already in Construcción.
    await waitFor(() => expect(within(column(container, "construccion")).queryByText("Casa Lomas")).toBeTruthy());
    const cached = client.getQueryData<ProyectosPageData>(qk.proyectos.list())!;
    expect(cached.projects.find((p) => p.id === "p-lomas")?.currentWorkflow?.key).toBe("construccion");
    await act(async () => resolve({ ok: true, data: { id: "p-lomas" } }));
  });

  it("dropping on the same column makes no call", () => {
    const { container } = renderLayout();
    pointerDrag(boardCard(container, "p-lomas"), column(container, "diseno"));
    expect(actions.setProjectCurrentTramoAction).not.toHaveBeenCalled();
  });

  it("drag rollback restores the column and toasts on NOT_STARTED", async () => {
    actions.setProjectCurrentTramoAction.mockResolvedValue({ ok: false, error: "NOT_STARTED" });
    const { container } = renderLayout();
    pointerDrag(boardCard(container, "p-lomas"), column(container, "construccion"));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Ese tramo aún no ha iniciado en este proyecto"));
    await waitFor(() => expect(within(column(container, "diseno")).queryByText("Casa Lomas")).toBeTruthy());
    expect(within(column(container, "construccion")).queryByText("Casa Lomas")).toBeNull();
  });

  it("toasts the permission copy on FORBIDDEN", async () => {
    actions.setProjectCurrentTramoAction.mockResolvedValue({ ok: false, error: "FORBIDDEN" });
    const { container } = renderLayout();
    pointerDrag(boardCard(container, "p-andares"), column(container, "diseno"));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("No tienes permiso para mover proyectos"));
  });

  it("keyboard drag announces the move", async () => {
    actions.setProjectCurrentTramoAction.mockResolvedValue({ ok: true, data: { id: "p-lomas" } });
    const { container } = renderLayout();
    const card = boardCard(container, "p-lomas");
    const live = container.querySelector<HTMLElement>('[data-slot="board-announcer"]')!;
    expect(live.getAttribute("aria-live")).toBe("polite");

    card.focus();
    fireEvent.keyDown(card, { key: " " });
    expect(live.textContent).toContain("Casa Lomas seleccionado");
    fireEvent.keyDown(card, { key: "ArrowRight" });
    expect(column(container, "construccion").dataset.dropTarget).toBe("true");
    fireEvent.keyDown(card, { key: " " });
    await waitFor(() => expect(actions.setProjectCurrentTramoAction).toHaveBeenCalledWith("p-lomas", "w3"));
    expect(live.textContent).toBe("Casa Lomas movido a Construcción");
    await waitFor(() => expect(within(column(container, "construccion")).queryByText("Casa Lomas")).toBeTruthy());
  });

  it("Esc cancels a keyboard move", () => {
    const { container } = renderLayout();
    const card = boardCard(container, "p-lomas");
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    fireEvent.keyDown(card, { key: "ArrowLeft" });
    fireEvent.keyDown(card, { key: "Escape" });
    expect(container.querySelector('[data-slot="board-announcer"]')!.textContent).toBe("Movimiento cancelado");
    expect(actions.setProjectCurrentTramoAction).not.toHaveBeenCalled();
  });

  it("no drag handles without canChangeProjectStage", () => {
    const { container } = renderLayout({ canChangeProjectStage: false });
    expect(container.querySelector('[data-slot="drag-handle"]')).toBeNull();
    expect(screen.queryByText("Arrastra un proyecto para moverlo de tramo")).toBeNull();
    const card = boardCard(container, "p-lomas");
    expect(card.getAttribute("draggable")).toBe("false");
    pointerDrag(card, column(container, "construccion"));
    card.focus();
    fireEvent.keyDown(card, { key: " " });
    fireEvent.keyDown(card, { key: "ArrowRight" });
    fireEvent.keyDown(card, { key: " " });
    expect(actions.setProjectCurrentTramoAction).not.toHaveBeenCalled();
  });

  it("hides Nuevo proyecto without canCreateProject", () => {
    const onNew = vi.fn();
    renderLayout({ canCreateProject: false }, onNew);
    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).toBeNull();
  });

  it("Nuevo proyecto (header and board ghost button) calls onNewProject", () => {
    const onNew = vi.fn();
    renderLayout({}, onNew);
    const buttons = screen.getAllByRole("button", { name: "Nuevo proyecto" });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => fireEvent.click(b));
    expect(onNew).toHaveBeenCalledTimes(2);
  });

  it("puts projects without tramo in a leading Sin tramo column", () => {
    const { container } = renderLayout({
      projects: [...PROJECTS, { ...PROJECTS[2], id: "p-sin", name: "Bodega Norte", status: "activo" }],
    });
    const columns = [...container.querySelectorAll<HTMLElement>('[data-slot="board-column"]')].map((c) => c.dataset.column);
    expect(columns[0]).toBe("sin-tramo");
  });

  it("collapses a day with more than three deliveries to +n más", () => {
    const extra = ["a", "b", "c"].map((id, i) => ({ ...PROJECTS[0], id: `p-${id}`, name: `Obra ${i + 1}` }));
    const { container } = renderLayout({
      projects: [...PROJECTS, ...extra],
      portfolio: [
        ...PORTFOLIO,
        ...extra.map((p) => ({ ...PORTFOLIO[0], projectId: p.id, nextDelivery: { title: "Losa", date: "2026-11-12" } })),
      ],
    });
    const day = container.querySelector<HTMLElement>('[data-day="2026-11-12"]')!;
    expect(within(day).getByRole("button", { name: "+1 más" })).toBeTruthy();
    expect(within(day).getAllByRole("listitem")).toHaveLength(4);
  });

  it("marks today in the timeline", () => {
    const { container } = renderLayout();
    const today = container.querySelector('[data-day="2026-11-10"] ul');
    expect(today?.getAttribute("aria-current")).toBe("date");
    expect(today?.getAttribute("aria-label")).toBe("martes 10");
    expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });

  it("empty state", () => {
    const onNew = vi.fn();
    renderLayout({ projects: [], portfolio: [] }, onNew);
    expect(screen.getByText("Aún no hay proyectos")).toBeTruthy();
    expect(screen.getByText("Crea el primero para empezar a darle seguimiento.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Portafolio por tramo" })).toBeNull();
    cleanup();
    renderLayout({ projects: [], portfolio: [], canCreateProject: false });
    expect(screen.getByText("Aún no hay proyectos")).toBeTruthy();
    expect(screen.queryByText("Crea el primero para empezar a darle seguimiento.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).toBeNull();
  });

  it("shows every tramo summary even with one project", () => {
    renderLayout({ projects: [PROJECTS[0]], portfolio: [PORTFOLIO[0]] });
    const summary = screen.getByRole("region", { name: "Portafolio por tramo" });
    const cards = within(summary).getAllByRole("button");
    expect(cards).toHaveLength(TRAMOS.length);
    expect(cards[0].textContent).toContain("0 proyectos");
  });
});
