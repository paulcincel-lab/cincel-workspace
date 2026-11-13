// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
const actions = vi.hoisted(() => ({ setProjectCurrentEtapaAction: vi.fn() }));
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
vi.mock("@/lib/etapas/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    canSeeAdminData: () => false,
    listEtapas: async () => [],
    etapaLabel: (key: string) => key,
    etapaColorSlot: (key: string) => slots[key] ?? null,
    etapaColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

import { PORTFOLIO, PROJECTS, portfolioPageData } from "@/components/proyectos/projects-portfolio.fixtures";
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

function projectCard(container: HTMLElement, id: string): HTMLAnchorElement {
  return container.querySelector<HTMLAnchorElement>(`[data-slot="project-card"][data-project="${id}"]`)!;
}

beforeEach(() => {
  resetProyectosDashboard();
  actions.setProjectCurrentEtapaAction.mockReset();
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
    // Two active projects (the paused one is reachable from Analítico) in two etapas; Casa Lomas delivers on day 2.
    expect(screen.getByText("2 obras activas · 1 entrega en los próximos 11 días.")).toBeTruthy();
    const sections = [...container.querySelectorAll<HTMLElement>("[data-section], [data-slot=delivery-timeline]")].map(
      (el) => el.dataset.section ?? el.dataset.slot,
    );
    expect(sections).toEqual(["summary", "attention", "projects", "delivery-timeline"]);
    expect(screen.getByRole("region", { name: "Resumen del portafolio" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Requieren atención" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver todos →" }).getAttribute("href")).toBe(
      "/proyectos?estilo=analitico&mostrar=vencidas",
    );
    expect(screen.getByRole("heading", { name: "Todos los proyectos" })).toBeTruthy();
    // No etapa board, no drag.
    expect(screen.queryByText("Arrastra un proyecto para moverlo de etapa")).toBeNull();
    expect(container.querySelector('[data-slot="board-column"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "Próximas entregas" })).toBeTruthy();
    expect(screen.getByText("10 – 20 NOV")).toBeTruthy();
    // Only Casa Lomas has overdue tasks.
    const attention = container.querySelectorAll('[data-slot="attention-card"]');
    expect([...attention].map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-lomas"]);
    // No budget in Visual.
    expect(container.textContent).not.toContain("Presup");
  });

  it("sections rise in 60 ms apart", () => {
    const { container } = renderLayout();
    const sections = [...container.querySelectorAll<HTMLElement>("[data-section], [data-slot=delivery-timeline]")];
    for (const section of sections) expect(section.classList.contains("rise")).toBe(true);
    expect(sections.map((el) => el.style.getPropertyValue("--anim-delay"))).toEqual(["0ms", "60ms", "120ms", "180ms"]);
  });

  it("without Requieren atención the projects and timeline keep the 60 ms step", () => {
    const { container } = renderLayout({ portfolio: PORTFOLIO.map((row) => ({ ...row, overdue: 0 })) });
    const sections = [...container.querySelectorAll<HTMLElement>("[data-section], [data-slot=delivery-timeline]")];
    expect(sections.map((el) => el.style.getPropertyValue("--anim-delay"))).toEqual(["0ms", "60ms", "120ms"]);
  });

  it("hides Requieren atención when no project has overdue tasks", () => {
    renderLayout({ portfolio: PORTFOLIO.map((row) => ({ ...row, overdue: 0 })) });
    expect(screen.queryByRole("heading", { name: "Requieren atención" })).toBeNull();
  });

  it("summary cards: Proyectos activos, Tareas abiertas, Vencidas and Avance medio", () => {
    renderLayout();
    const summary = screen.getByRole("region", { name: "Resumen del portafolio" });
    const cards = [...summary.querySelectorAll<HTMLElement>('[data-slot="portfolio-summary"]')];
    expect(cards.map((c) => c.dataset.summary)).toEqual(["activos", "abiertas", "vencidas", "avance"]);
    // Not toggles: the etapa filter is gone from Visual.
    expect(within(summary).queryAllByRole("button")).toHaveLength(0);
    // Casa Lomas (4 open, 2 overdue, 62 %) and Depto Andares (8 open, 15 %).
    expect(cards[0].textContent).toContain("Proyectos activos");
    expect(cards[0].textContent).toContain("2proyectos");
    expect(cards[1].textContent).toContain("12tareas abiertas");
    expect(cards[2].textContent).toContain("2tareas vencidas");
    expect(within(cards[3]).getByRole("img", { name: "Avance medio 39 %" })).toBeTruthy();
  });

  it("project grid: one card per project by name; a card opens the project", () => {
    const { container } = renderLayout();
    const grid = container.querySelector<HTMLElement>('[data-slot="project-grid"]')!;
    const cards = [...grid.querySelectorAll<HTMLAnchorElement>('[data-slot="project-card"]')];
    expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/proyectos/p-lomas", "/proyectos/p-andares"]);
    const lomas = projectCard(container, "p-lomas");
    // Same card as Requieren atención: ring, name, chip, pills, avatars and next delivery; no etapa stepper.
    expect(within(lomas).getByRole("img", { name: "Avance 62 %" })).toBeTruthy();
    expect(within(lomas).getByText("Casa Lomas")).toBeTruthy();
    expect(within(lomas).getByText("Diseño")).toBeTruthy();
    expect(within(lomas).queryByRole("img", { name: /^Etapa actual/ })).toBeNull();
    expect(lomas.textContent).toContain("4 abiertas");
    expect(lomas.textContent).toContain("2 vencidas");
    expect(lomas.textContent).toContain("Plano de acabados");
    expect(lomas.getAttribute("draggable")).toBeNull();
  });

  it("hides Nuevo proyecto without canCreateProject", () => {
    const onNew = vi.fn();
    renderLayout({ canCreateProject: false }, onNew);
    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).toBeNull();
  });

  it("Nuevo proyecto (header and the grid's ghost card) calls onNewProject", () => {
    const onNew = vi.fn();
    renderLayout({}, onNew);
    const buttons = screen.getAllByRole("button", { name: "Nuevo proyecto" });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => fireEvent.click(b));
    expect(onNew).toHaveBeenCalledTimes(2);
  });

  it("a project without etapa is a card like the rest, with the Sin etapa chip", () => {
    const { container } = renderLayout({
      projects: [...PROJECTS, { ...PROJECTS[2], id: "p-sin", name: "Bodega Norte", status: "activo" }],
    });
    const cards = [...container.querySelectorAll<HTMLElement>('[data-slot="project-card"]')].map((c) => c.dataset.project);
    expect(cards).toEqual(["p-sin", "p-lomas", "p-andares"]);
    expect(within(projectCard(container, "p-sin")).getByText("Sin etapa")).toBeTruthy();
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
    expect(screen.queryByRole("region", { name: "Resumen del portafolio" })).toBeNull();
    cleanup();
    renderLayout({ projects: [], portfolio: [], canCreateProject: false });
    expect(screen.getByText("Aún no hay proyectos")).toBeTruthy();
    expect(screen.queryByText("Crea el primero para empezar a darle seguimiento.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuevo proyecto" })).toBeNull();
  });

  it("always shows the four summary cards, even with one project", () => {
    renderLayout({ projects: [PROJECTS[0]], portfolio: [PORTFOLIO[0]] });
    const summary = screen.getByRole("region", { name: "Resumen del portafolio" });
    expect(summary.querySelectorAll('[data-slot="portfolio-summary"]')).toHaveLength(4);
  });
});
