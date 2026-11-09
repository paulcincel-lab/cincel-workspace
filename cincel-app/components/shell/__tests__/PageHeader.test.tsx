// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeader as WidgetPageHeader } from "@/components/widgets/PageHeader";

afterEach(() => {
  document.documentElement.removeAttribute("data-style");
});

describe("PageHeader", () => {
  it("is the widget header (base header + Estilo switch) re-exported from the shell", () => {
    expect(PageHeader).toBe(WidgetPageHeader);
  });

  it("renders today's header for the legacy props (title, description, actions) and no breadcrumb", () => {
    const { container } = render(
      <PageHeader title="Proyectos" description="Todos los proyectos activos" actions={<button type="button">Nuevo</button>} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Proyectos" })).toBeTruthy();
    expect(screen.getByText("Todos los proyectos activos")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nuevo" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelector("h1")?.className).toContain("text-lg");
    expect(container.querySelector("h1")?.className).toContain("font-semibold");
  });

  it("renders only the title when nothing else is given", () => {
    const { container } = render(<PageHeader title="Equipo" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Equipo" })).toBeTruthy();
  });

  it("renders the breadcrumb with links for earlier items and the last one as the current page", () => {
    render(
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

  it("renders the badge next to the title", () => {
    render(<PageHeader title="Mi espacio" badge={<span>Solo tú lo ves</span>} />);
    const heading = screen.getByRole("heading", { name: "Mi espacio" });
    expect(heading.parentElement?.textContent).toContain("Solo tú lo ves");
  });

  it("uses the 22 px title only on redesign pages and never a weight above 600", () => {
    const { container } = render(<PageHeader title="Inicio" />);
    const h1 = container.querySelector("h1")!;
    expect(h1.className).toContain("[html[data-style]_&]:text-[22px]");
    expect(h1.className).not.toMatch(/font-(bold|extrabold|black)/);
  });
});
