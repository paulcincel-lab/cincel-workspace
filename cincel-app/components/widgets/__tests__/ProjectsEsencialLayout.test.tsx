// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => nav.params,
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({ getProyectosPageData: vi.fn() }));
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

import { PORTFOLIO, PROJECTS, portfolioPageData } from "@/components/proyectos/projects-portfolio.fixtures";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { ProjectsEsencialLayout } from "@/components/widgets/ProjectsEsencialLayout";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";

function renderLayout(patch: Partial<ProyectosPageData> = {}, onNewProject?: () => void) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.list(), portfolioPageData({ portfolio: PORTFOLIO, ...patch }));
  return renderWithQueryClient(
    <StyleProvider style="esencial" scope="staff">
      <ProjectsEsencialLayout onNewProject={onNewProject} />
    </StyleProvider>,
    { client },
  );
}

function cardLinks(container: HTMLElement): HTMLAnchorElement[] {
  return [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/proyectos/"]')];
}

beforeEach(() => {
  resetProyectosDashboard();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  nav.params = new URLSearchParams();
});

describe("ProjectsEsencialLayout", () => {
  it("renders one card per listed project", () => {
    const { container } = renderLayout();
    // Two active projects; the paused and the archived ones are not listed in Esencial.
    expect(cardLinks(container).map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-lomas", "/proyectos/p-andares"]);
    expect(screen.getByText("2 activos · en qué etapa va cada obra y qué sigue.")).toBeTruthy();
    // Casa Lomas: 4 open, 2 overdue; Depto Andares: al día.
    expect(screen.getByText("vencidas", { exact: false })).toBeTruthy();
    expect(screen.getByText("Al día")).toBeTruthy();
    expect(screen.getByText("Plano de acabados ·")).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
    // No chart: the only circles are in the icons.
    expect(container.querySelector("svg:not(.lucide) circle")).toBeNull();
  });

  it("pill selection filters and Todos clears", () => {
    const { container } = renderLayout();
    const group = screen.getByRole("radiogroup", { name: "Filtrar por etapa" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["Todos2", "Presale1", "Diseño1"]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");

    fireEvent.click(within(group).getByRole("radio", { name: /Diseño/ }));
    expect(within(group).getByRole("radio", { name: /Diseño/ }).getAttribute("aria-checked")).toBe("true");
    expect(cardLinks(container).map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-lomas"]);

    fireEvent.click(within(group).getByRole("radio", { name: /Todos/ }));
    expect(cardLinks(container)).toHaveLength(2);
  });

  it("moves the focus with the arrows and selects with Space", () => {
    const { container } = renderLayout();
    const radios = within(screen.getByRole("radiogroup", { name: "Filtrar por etapa" })).getAllByRole("radio");
    // Focusing a pill sets its roving focus index, a state update.
    act(() => radios[0].focus());
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1].getAttribute("aria-checked")).toBe("false");
    fireEvent.keyDown(radios[1], { key: " " });
    expect(cardLinks(container).map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-andares"]);
  });

  it("search updates ?q= after the debounce", () => {
    vi.useFakeTimers();
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const { container } = renderLayout();
    const input = screen.getByLabelText("Buscar proyectos");
    fireEvent.change(input, { target: { value: "andáres" } });
    // The list filters right away (accent-insensitive); the URL waits for the debounce.
    expect(cardLinks(container).map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-andares"]);
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0][2])).toBe("/proyectos?q=and%C3%A1res");

    // Esc clears the field.
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    expect(cardLinks(container)).toHaveLength(2);
  });

  it("searches the client name and the place", () => {
    const client = { id: "c1", name: "Familia Gómez", type: "cliente" as const };
    const { container } = renderLayout({ projects: [{ ...PROJECTS[0], client }, PROJECTS[1]] });
    const input = screen.getByLabelText("Buscar proyectos");
    fireEvent.change(input, { target: { value: "gomez" } });
    expect(cardLinks(container).map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-lomas"]);
    fireEvent.change(input, { target: { value: "zapopan" } });
    expect(cardLinks(container).map((a) => a.getAttribute("href"))).toEqual(["/proyectos/p-andares"]);
  });

  it("no-results copy with and without a etapa", () => {
    renderLayout();
    const input = screen.getByLabelText("Buscar proyectos");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("Ningún proyecto coincide con «zzz».")).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: /Diseño/ }));
    fireEvent.change(input, { target: { value: "Andares" } });
    expect(screen.getByText("Ningún proyecto de «Diseño» coincide con «Andares».")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ver todas las etapas" }));
    expect(screen.getByRole("radio", { name: /Todos/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Sin resultados")).toBeNull();
  });

  it("project without etapa shows Sin etapa", () => {
    const sinTramo = { ...PROJECTS[2], id: "p-sin", name: "Bodega Norte", status: "activo" as const };
    const { container } = renderLayout({ projects: [PROJECTS[0], sinTramo] });
    expect(screen.getByRole("radio", { name: /Sin etapa/ })).toBeTruthy();
    const card = cardLinks(container).find((a) => a.getAttribute("href") === "/proyectos/p-sin");
    expect(card).toBeTruthy();
    const line = container.querySelector('[aria-label="Etapa actual: Sin etapa"]');
    expect(line).not.toBeNull();
    expect(within(line as HTMLElement).getByText("Sin etapa")).toBeTruthy();
    expect(line!.querySelectorAll('[data-state="next"]')).toHaveLength(3);
  });

  it("hides Nuevo proyecto without permission", () => {
    renderLayout({ canCreateProject: false });
    expect(screen.queryByRole("button", { name: /Nuevo proyecto/ })).toBeNull();
  });

  it("Nuevo proyecto calls onNewProject", () => {
    const onNew = vi.fn();
    renderLayout({}, onNew);
    fireEvent.click(screen.getByRole("button", { name: /Nuevo proyecto/ }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("empty state with and without permission", () => {
    renderLayout({ projects: [], portfolio: [] });
    expect(screen.getByText("Aún no hay proyectos")).toBeTruthy();
    expect(screen.getByText("Crea el primero para empezar a darle seguimiento.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Nuevo proyecto/ }).length).toBeGreaterThan(0);
    cleanup();
    renderLayout({ projects: [], portfolio: [], canCreateProject: false });
    expect(screen.getByText("Aún no hay proyectos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Nuevo proyecto/ })).toBeNull();
  });

  it("shows the skeleton while loading and the error with Reintentar", async () => {
    const { getProyectosPageData } = await import("@/lib/actions/page-data/proyectos-actions");
    // The first load never answers, so the skeleton stays up.
    vi.mocked(getProyectosPageData).mockReturnValue(new Promise(() => {}));
    const pending = renderWithQueryClient(
      <StyleProvider style="esencial" scope="staff">
        <ProjectsEsencialLayout />
      </StyleProvider>,
    );
    expect(pending.container.querySelector('[data-slot="projects-esencial-skeleton"]')).not.toBeNull();
    pending.unmount();

    vi.mocked(getProyectosPageData).mockRejectedValue(new Error("boom"));
    renderWithQueryClient(
      <StyleProvider style="esencial" scope="staff">
        <ProjectsEsencialLayout />
      </StyleProvider>,
    );
    expect(await screen.findByText("No se pudieron cargar los proyectos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
