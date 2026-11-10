// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
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

import { PORTFOLIO, portfolioPageData } from "@/components/proyectos/projects-portfolio.fixtures";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { ProjectsAnaliticoLayout } from "@/components/widgets/ProjectsAnaliticoLayout";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

function renderLayout(patch: Partial<ProyectosPageData> = {}, onNewProject?: () => void) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.list(), portfolioPageData({ portfolio: PORTFOLIO, ...patch }));
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <ProjectsAnaliticoLayout onNewProject={onNewProject} />
    </StyleProvider>,
    { client },
  );
}

function projectLinks(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLAnchorElement>('a[href^="/proyectos/"]')].map((a) => a.getAttribute("href")!);
}

/** The group header buttons (`aria-expanded`), by tramo label. */
function groupButton(label: string): HTMLElement {
  return screen.getAllByRole("button").find((b) => b.hasAttribute("aria-expanded") && b.textContent?.includes(label))!;
}

function groupButtons(): HTMLElement[] {
  return screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("aria-expanded") && (b.textContent?.includes("Presale") || b.textContent?.includes("Diseño")));
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  nav.params = new URLSearchParams();
  nav.replace.mockReset();
});

describe("ProjectsAnaliticoLayout", () => {
  it("renders the header, KPIs, the tramo card and the grouped rows", () => {
    const { container } = renderLayout();
    expect(screen.getByText("Portafolio por tramo: avance contra plan, carga y retrasos.")).toBeTruthy();
    expect(screen.getByText("PROYECTOS ACTIVOS")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Proyectos por tramo" })).toBeTruthy();
    // Two active projects; the paused one only with Incluir pausados.
    expect(projectLinks(container).sort()).toEqual(["/proyectos/p-andares", "/proyectos/p-lomas"]);
    expect(screen.getByText("Heat: % vencidas > 45 % ámbar, > 60 % rojo · Desv. plan ≤ −5 ámbar, ≤ −8 rojo.")).toBeTruthy();
  });

  it("filters write the URL with router.replace", () => {
    vi.useFakeTimers();
    const { container } = renderLayout();

    fireEvent.click(screen.getByRole("radio", { name: /Con vencidas/ }));
    expect(nav.replace).toHaveBeenLastCalledWith("/proyectos?mostrar=vencidas", { scroll: false });
    expect(projectLinks(container)).toEqual(["/proyectos/p-lomas"]);

    fireEvent.click(screen.getByRole("button", { name: /^Diseño/, pressed: false }));
    expect(nav.replace).toHaveBeenLastCalledWith("/proyectos?mostrar=vencidas&tramo=diseno", { scroll: false });
    expect(screen.getByRole("button", { name: /^Diseño/, pressed: true })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Incluir pausados/ }));
    expect(nav.replace).toHaveBeenLastCalledWith("/proyectos?mostrar=vencidas&tramo=diseno&pausados=1", { scroll: false });

    // The search waits for the debounce.
    const calls = nav.replace.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Buscar proyectos"), { target: { value: "lomas" } });
    expect(nav.replace.mock.calls.length).toBe(calls);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(nav.replace).toHaveBeenLastCalledWith("/proyectos?mostrar=vencidas&tramo=diseno&pausados=1&q=lomas", { scroll: false });
    expect(nav.replace.mock.calls.every(([, opts]) => opts?.scroll === false)).toBe(true);
  });

  it("restores the filters from the URL and ignores unknown values", () => {
    nav.params = new URLSearchParams("mostrar=nada&tramo=presale,inventado&mios=1");
    const { container } = renderLayout();
    expect(screen.getByRole("radio", { name: /Todos/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: /^Presale/, pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Solo míos/, pressed: true })).toBeTruthy();
    expect(projectLinks(container)).toEqual(["/proyectos/p-andares"]);
  });

  it("group collapse and expand all", () => {
    renderLayout();
    expect(groupButtons().map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "true"]);

    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    expect(groupButtons().map((b) => b.getAttribute("aria-expanded"))).toEqual(["false", "false"]);

    fireEvent.click(screen.getByRole("button", { name: "Expandir todo" }));
    expect(groupButtons().map((b) => b.getAttribute("aria-expanded"))).toEqual(["true", "true"]);

    fireEvent.click(groupButton("Diseño"));
    expect(groupButton("Diseño").getAttribute("aria-expanded")).toBe("false");
    expect(groupButton("Presale").getAttribute("aria-expanded")).toBe("true");
  });

  it("Ir a focuses the group", () => {
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    const tramoNav = screen.getByRole("navigation", { name: "Ir a tramo" });
    const link = within(tramoNav).getByRole("link", { name: /Diseño/ });
    expect(link.getAttribute("href")).toBe("#t-diseno");
    // Casa Lomas has 2 overdue tasks: the anchor count.
    expect(link.textContent).toContain("2");

    fireEvent.click(link);
    const button = groupButton("Diseño");
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("sorting a numeric column sets aria-sort", () => {
    renderLayout();
    const header = () => screen.getAllByRole("columnheader").find((th) => th.textContent?.includes("Abiertas"))!;
    expect(header().getAttribute("aria-sort")).toBe("none");

    fireEvent.click(within(header()).getByRole("button"));
    expect(header().getAttribute("aria-sort")).toBe("descending");

    fireEvent.click(within(header()).getByRole("button"));
    expect(header().getAttribute("aria-sort")).toBe("ascending");

    // Text columns are not sortable.
    const proyecto = screen.getAllByRole("columnheader").find((th) => th.textContent?.startsWith("Proyecto"))!;
    expect(within(proyecto).queryByRole("button")).toBeNull();
  });

  it("no-match row and Quitar filtros", () => {
    const { container } = renderLayout();
    fireEvent.click(screen.getByRole("radio", { name: /Atrasados vs plan/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Presale/, pressed: false }));
    expect(screen.getByText("Ningún proyecto coincide con los filtros.")).toBeTruthy();
    expect(projectLinks(container)).toEqual([]);
    // KPIs follow the visible rows.
    expect(screen.getByText("PROYECTOS ACTIVOS").parentElement?.textContent).toContain("0");

    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    // Every filter param goes.
    expect(nav.replace).toHaveBeenLastCalledWith("/proyectos", { scroll: false });
    expect(projectLinks(container).sort()).toEqual(["/proyectos/p-andares", "/proyectos/p-lomas"]);
  });

  it("shows the budget column and its legend only for admins", () => {
    renderLayout({ canSeeAdminData: true });
    expect(screen.getAllByRole("columnheader").some((th) => th.textContent?.includes("Presup. ejercido"))).toBe(true);
    expect(screen.getByText(/La columna de presupuesto solo la ven administradores\./)).toBeTruthy();
    cleanup();
    renderLayout({ canSeeAdminData: false });
    expect(screen.getAllByRole("columnheader").some((th) => th.textContent?.includes("Presup. ejercido"))).toBe(false);
    expect(screen.queryByText(/La columna de presupuesto/)).toBeNull();
  });

  it("empty database: EmptyState with Nuevo proyecto, no KPIs and no table", () => {
    const onNew = vi.fn();
    const { container } = renderLayout({ projects: [], portfolio: [] }, onNew);
    expect(screen.getByText("Aún no hay proyectos")).toBeTruthy();
    expect(screen.queryByText("PROYECTOS ACTIVOS")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
    const buttons = screen.getAllByRole("button", { name: /Nuevo proyecto/ });
    fireEvent.click(buttons[buttons.length - 1]!);
    expect(onNew).toHaveBeenCalled();
  });
});
