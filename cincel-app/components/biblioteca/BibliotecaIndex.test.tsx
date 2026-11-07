// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { EntityCardGridProps } from "@/components/widgets/EntityCardGrid";

import { bibliotecaFixture, makeLink } from "./biblioteca.fixtures";
import { BibliotecaIndex } from "./BibliotecaIndex";

// Render the widget's inputs as plain markup so the test reads what the index hands it.
vi.mock("@/components/widgets/EntityCardGrid", () => ({
  EntityCardGrid: ({ items, table, emptyState }: EntityCardGridProps) => (
    <div data-testid="grid" data-columns={(table?.columns ?? []).map((c) => c.label).join("|")}>
      {items.length === 0 ? <p>{emptyState?.title}</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={item.href}>{item.title}</a>
            {item.subtitle ? <span> {item.subtitle}</span> : null}
            {(item.meta ?? []).map((m) => (
              <span key={m.label}> {m.value}</span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));

const RECENT_KEY = "cincel.resources.recent-docs.v1";

function group(name: string) {
  return screen.getByRole("region", { name });
}

describe("BibliotecaIndex", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("renders Empresa and Recursos cards with count and last update", () => {
    render(<BibliotecaIndex links={bibliotecaFixture()} />);
    const empresa = within(group("Empresa"));
    for (const title of ["Book", "Manual de la empresa", "Imagen de la empresa", "RFC", "Políticas de la empresa"]) {
      expect(empresa.getByRole("link", { name: title })).toBeTruthy();
    }
    expect(empresa.getByRole("link", { name: "Manual de la empresa" }).getAttribute("href")).toBe("/biblioteca/empresa/manual-de-la-empresa");

    const recursos = within(group("Recursos"));
    for (const title of ["Formación", "Formatos de obra", "Plantillas de diseño", "Mis documentos", "Mis favoritos", "Mis vacaciones"]) {
      expect(recursos.getByRole("link", { name: title })).toBeTruthy();
    }
    const formatos = recursos.getByRole("link", { name: "Formatos de obra" }).closest("li")!;
    expect(formatos.textContent).toContain("3 documentos");
    expect(formatos.textContent).toContain("act. 5 nov");
    expect(recursos.getByRole("link", { name: "Mis vacaciones" }).getAttribute("href")).toBe("/biblioteca/vacaciones");
  });

  it("hands the Analítico catalog table (Sección, Documentos, Actualizado) without views / downloads", () => {
    render(<BibliotecaIndex links={bibliotecaFixture()} />);
    const grid = within(group("Recursos")).getByTestId("grid");
    expect(grid.getAttribute("data-columns")).toBe("Sección|Documentos|Actualizado");
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/vistas|descargas/);
  });

  it("hides Empresa when the viewer can't see it", () => {
    render(<BibliotecaIndex links={bibliotecaFixture()} showEmpresa={false} />);
    expect(screen.queryByRole("region", { name: "Empresa" })).toBeNull();
    expect(group("Recursos")).toBeTruthy();
  });

  it("reads 'Abiertos recientemente' from the existing localStorage key", () => {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([
        {
          id: "manual-2",
          title: "Cómo abrimos un proyecto",
          url: "https://docs.google.com/document/d/docmanual2/edit",
          openedAt: "2026-11-06T18:00:00.000Z",
          section: "empresa",
        },
      ]),
    );
    render(<BibliotecaIndex links={bibliotecaFixture()} />);
    const recent = within(group("Abiertos recientemente"));
    const link = recent.getByRole("link", { name: "Cómo abrimos un proyecto" });
    expect(link.getAttribute("href")).toBe("/biblioteca/empresa/manual-de-la-empresa?parte=manual-2");
    expect(link.closest("li")?.textContent).toContain("Empresa · 6 nov");
  });

  it("falls back to the first Drive files when nothing was opened, as the workspace does", () => {
    render(<BibliotecaIndex links={[makeLink({ id: "solo", title: "Checklist de visita", section: "formatos-obra" })]} />);
    expect(within(group("Abiertos recientemente")).getByRole("link", { name: "Checklist de visita" })).toBeTruthy();
  });

  it("filters the catalog with the search box", () => {
    render(<BibliotecaIndex links={bibliotecaFixture()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar en la biblioteca" }), { target: { value: "bitácora" } });
    expect(screen.queryByRole("region", { name: "Abiertos recientemente" })).toBeNull();
    const recursos = within(group("Recursos"));
    expect(recursos.getByRole("link", { name: "Formatos de obra" })).toBeTruthy();
    expect(recursos.queryByRole("link", { name: "Formación" })).toBeNull();
    expect(within(group("Empresa")).getByText("Sin resultados")).toBeTruthy();
  });
});
