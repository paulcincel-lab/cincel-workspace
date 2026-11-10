// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";

vi.mock("@/lib/actions/preferences-actions", () => ({
  updateMyPreferencesAction: vi.fn(),
  fetchMyPreferencesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PageHeader } from "@/components/shell/PageHeader";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { Button } from "@/components/ui/shadcn/button";
import { PageHeader as WidgetPageHeader } from "@/components/widgets/PageHeader";

function renderStaff(ui: ReactElement, opts: { fixedByOrg?: boolean } = {}) {
  return render(
    <StyleProvider style="visual" scope="staff" fixedByOrg={opts.fixedByOrg}>
      {ui}
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-style");
});

describe("PageHeader", () => {
  it("is the widget header (base header + Estilo switch) re-exported from the shell", () => {
    expect(PageHeader).toBe(WidgetPageHeader);
  });

  it("renders title, description and actions", () => {
    const { container } = renderStaff(
      <PageHeader
        title="Proyectos"
        description="Todos los proyectos activos"
        actions={
          <>
            <Button variant="outline">Exportar</Button>
            <Button>Nuevo proyecto</Button>
          </>
        }
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Proyectos" })).toBeTruthy();
    expect(screen.getByText("Todos los proyectos activos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuevo proyecto" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("renders the Estilo switch after the actions", () => {
    const { container } = renderStaff(<PageHeader title="Tareas" actions={<Button>Nueva tarea</Button>} />);
    const groups = screen.getAllByRole("radiogroup", { name: "Estilo" });
    expect(groups).toHaveLength(1);
    const action = screen.getByRole("button", { name: "Nueva tarea" });
    const switchRoot = container.querySelector('[data-slot="estilo-switch"]')!;
    expect(action.parentElement).toBe(switchRoot.parentElement);
    expect(action.compareDocumentPosition(switchRoot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(switchRoot.nextElementSibling).toBeNull();
  });

  it("renders the Estilo switch alone when the page has no actions", () => {
    renderStaff(<PageHeader title="Asistente" />);
    expect(screen.getByRole("radiogroup", { name: "Estilo" })).toBeTruthy();
  });

  it("keeps the switch keyboard operable from the header (one tab stop, arrows, Home, End)", () => {
    renderStaff(<PageHeader title="Tareas" />);
    const radios = within(screen.getByRole("radiogroup", { name: "Estilo" })).getAllByRole("radio");
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "End" });
    expect(document.activeElement).toBe(radios[2]);
    fireEvent.keyDown(radios[2], { key: "Home" });
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(radios[1]);
  });

  it("estilo={false} renders no switch", () => {
    renderStaff(<PageHeader estilo={false} title="Ajustes" actions={<Button>Guardar</Button>} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeTruthy();
  });

  it("estilo={false} without actions renders no actions row", () => {
    const { container } = renderStaff(<PageHeader estilo={false} title="Tramos y fases" />);
    const header = container.querySelector('[data-slot="page-header"]')!;
    expect(header.children).toHaveLength(1);
  });

  it("hides the switch when the organization fixed the style", () => {
    renderStaff(<PageHeader title="Tareas" actions={<Button>Nueva tarea</Button>} />, { fixedByOrg: true });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("button", { name: "Nueva tarea" })).toBeTruthy();
  });

  it("renders only the title when nothing else is given", () => {
    const { container } = renderStaff(<PageHeader estilo={false} title="Equipo" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Equipo" })).toBeTruthy();
  });

  it("renders the breadcrumb with the last item as plain text", () => {
    renderStaff(
      <PageHeader
        title="Casa Lomas"
        breadcrumb={[
          { label: "Proyectos", href: "/proyectos" },
          { label: "Activos" },
          { label: "Casa Lomas", href: "/proyectos/1" },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Ruta" });
    const link = within(nav).getByRole("link", { name: "Proyectos" });
    expect(link.getAttribute("href")).toBe("/proyectos");
    expect(within(nav).getByText("Activos").closest("a")).toBeNull();
    const current = within(nav).getByText("Casa Lomas");
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.closest("a")).toBeNull();
  });

  it("puts the breadcrumb links before the actions and the switch in tab order", () => {
    const { container } = renderStaff(
      <PageHeader
        title="Mis vacaciones"
        breadcrumb={[{ label: "Biblioteca", href: "/biblioteca" }, { label: "Mis vacaciones" }]}
        actions={<Button>Solicitar</Button>}
      />,
    );
    const focusable = [...container.querySelectorAll<HTMLElement>("a[href], button")].filter((el) => el.tabIndex >= 0);
    expect(focusable.map((el) => el.textContent?.trim())).toEqual(["Biblioteca", "Solicitar", "Visual"]);
  });

  it("renders the badge next to the title", () => {
    renderStaff(<PageHeader title="Mi espacio" badge={<span>Solo tú lo ves</span>} />);
    const heading = screen.getByRole("heading", { name: "Mi espacio" });
    expect(heading.parentElement?.textContent).toContain("Solo tú lo ves");
  });

  it("keeps today's sizes on legacy pages and follows the canvas on redesign pages", () => {
    const { container } = renderStaff(<PageHeader title="Inicio" description="Resumen del día" />);
    const h1 = container.querySelector("h1")!;
    expect(h1.className).toContain("text-lg");
    expect(h1.className).toContain("font-semibold");
    expect(h1.className).toContain("[html[data-style]_&]:text-[length:var(--type-pageTitle-size,22px)]");
    expect(h1.className).toContain("[html[data-style]_&]:[font-weight:var(--type-pageTitle-weight,600)]");
    expect(h1.className).toContain("[html[data-style]_&]:tracking-[-0.02em]");
    expect(h1.className).not.toMatch(/font-(bold|extrabold|black)/);
    const description = screen.getByText("Resumen del día");
    expect(description.className).toContain("text-xs");
    expect(description.className).toContain("[html[data-style]_&]:text-[15px]");
  });

  it("wraps the header and the actions row (no horizontal scroll at 390 px)", () => {
    const { container } = renderStaff(<PageHeader title="Proyectos" actions={<Button>Nuevo proyecto</Button>} />);
    const header = container.querySelector('[data-slot="page-header"]')!;
    expect(header.className).toContain("flex-wrap");
    const actions = container.querySelector('[data-slot="estilo-switch"]')!.parentElement!;
    expect(actions.className).toContain("[html[data-style]_&]:flex-wrap");
    expect(actions.className).toContain("[html[data-style]_&]:gap-2.5");
    expect(header.className).not.toContain("overflow-x");
    expect(h1Truncated(container)).toBe(false);
  });
});

function h1Truncated(container: HTMLElement): boolean {
  return /\b(truncate|line-clamp-\d)\b/.test(container.querySelector("h1")?.className ?? "");
}
