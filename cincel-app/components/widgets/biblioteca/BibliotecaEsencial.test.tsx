// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { bibliotecaFixture, makeLink, resourcesCapabilities } from "@/components/biblioteca/biblioteca.fixtures";
import type { RecentDocument } from "@/lib/stores/recent-docs-store";
import type { ResourceLink } from "@/lib/types/resource";
import type { MyVacations } from "@/lib/vacations/reads";

import { BibliotecaEsencial } from "./BibliotecaEsencial";
import type { BibliotecaLayoutProps } from "./types";

const NOW = new Date("2026-11-09T18:00:00.000Z");
const VACATIONS: MyVacations = { balance: { entitled: 20, taken: 6, pending: 2, available: 12 }, requests: [] };

const RECENTS: RecentDocument[] = [
  {
    id: "bitacora",
    title: "Bitácora de obra",
    url: "https://docs.google.com/document/d/docbitacora/edit",
    openedAt: "2026-11-09T17:55:00.000Z",
    section: "formatos-obra",
  },
];

/** What `BibliotecaIndex` hands the layout once `biblioteca.links(null)` and `me.vacations()` are cached. */
function esencialProps(overrides: Partial<BibliotecaLayoutProps> = {}): BibliotecaLayoutProps {
  const links: ResourceLink[] = overrides.links ?? bibliotecaFixture();
  return {
    links,
    capabilities: resourcesCapabilities(),
    showEmpresa: true,
    showRecursos: true,
    query: "",
    onQueryChange: () => {},
    recents: RECENTS,
    vacations: VACATIONS,
    isPending: false,
    driveEnabled: false,
    now: NOW,
    today: "2026-11-09",
    ...overrides,
  };
}

function block(name: string) {
  return screen.getByRole("region", { name });
}

function recursoNames(): string[] {
  return within(block("Recursos"))
    .getAllByRole("link")
    .map((link) => link.querySelector("span > span")?.textContent ?? "");
}

describe("BibliotecaEsencial", () => {
  afterEach(() => cleanup());

  it("renders recientes, la empresa, recursos in order", () => {
    render(<BibliotecaEsencial {...esencialProps()} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Abiertos recientemente", "La empresa", "Recursos"]);

    const recent = within(block("Abiertos recientemente")).getByRole("link", { name: /Bitácora de obra/ });
    expect(recent.textContent).toContain("Formatos de obra");
    expect(recent.getAttribute("href")).toBe("https://docs.google.com/document/d/docbitacora/edit");

    const empresa = within(block("La empresa"));
    const titles = empresa.getAllByRole("link").map((link) => link.getAttribute("title"));
    expect(titles).toEqual(["Book", "Manual de la empresa", "Imagen de la empresa", "RFC", "Políticas de la empresa"]);
    expect(empresa.getByRole("link", { name: /Manual de la empresa/ }).getAttribute("href")).toBe(
      "/biblioteca/empresa/manual-de-la-empresa",
    );
    expect(empresa.getByRole("link", { name: /Manual de la empresa/ }).textContent).toContain("2 documentos");

    expect(recursoNames()).toEqual([
      "Formatos de obra",
      "Plantillas de diseño",
      "Formación",
      "Mis documentos",
      "Mis favoritos",
      "Mis vacaciones",
    ]);
    const recursos = within(block("Recursos"));
    expect(recursos.getByRole("link", { name: /Formatos de obra/ }).textContent).toContain("3 documentos · act. 5 nov");
    expect(recursos.getByRole("link", { name: /Formatos de obra/ }).getAttribute("href")).toBe("/biblioteca/formatos-obra");
    const formacion = recursos.getByRole("link", { name: /Formación/ });
    expect(formacion.textContent).toContain("0 documentos");
    expect(formacion.textContent).not.toContain("act.");
    const vacaciones = recursos.getByRole("link", { name: /Mis vacaciones/ });
    expect(vacaciones.getAttribute("href")).toBe("/biblioteca/vacaciones");
    expect(vacaciones.textContent).toContain("12 días disponibles");

    expect(document.querySelector("table, canvas, img, [role='img']")).toBeNull();
  });

  it("shows nuevo on an empresa doc with a part created this week", () => {
    const links = [
      ...bibliotecaFixture(),
      makeLink({ id: "book-1", section: "empresa", title: "Book · Casa Lomas", templateKey: "book", createdAt: "2026-11-06T16:00:00.000Z" }),
    ];
    render(<BibliotecaEsencial {...esencialProps({ links })} />);
    const empresa = within(block("La empresa"));
    expect(empresa.getByRole("link", { name: /^Book/ }).textContent).toContain("1 documento · nuevo");
    expect(empresa.getByRole("link", { name: /Manual de la empresa/ }).textContent).not.toContain("nuevo");
  });

  it("singular documento", () => {
    render(<BibliotecaEsencial {...esencialProps()} />);
    const misDocumentos = within(block("Recursos")).getByRole("link", { name: /Mis documentos/ });
    expect(misDocumentos.textContent).toMatch(/1 documento$/);
    expect(within(block("Recursos")).getByRole("link", { name: /Mis favoritos/ }).textContent).toMatch(/1 documento$/);
    expect(within(block("La empresa")).getByRole("link", { name: /RFC/ }).textContent).toMatch(/1 documento$/);
  });

  it("hides La empresa without enterprise.canView", () => {
    render(<BibliotecaEsencial {...esencialProps({ showEmpresa: false })} />);
    expect(screen.queryByRole("region", { name: "La empresa" })).toBeNull();
    expect(block("Recursos")).toBeTruthy();
  });

  it("shows only Mis vacaciones without canViewResources", () => {
    render(<BibliotecaEsencial {...esencialProps({ showRecursos: false, showEmpresa: false })} />);
    expect(recursoNames()).toEqual(["Mis vacaciones"]);
  });

  it("vacations null shows Ver saldo y solicitudes", () => {
    render(<BibliotecaEsencial {...esencialProps({ vacations: null })} />);
    const vacaciones = within(block("Recursos")).getByRole("link", { name: /Mis vacaciones/ });
    expect(vacaciones.textContent).toContain("Ver saldo y solicitudes");
  });

  it("search hides blocks without matches", () => {
    // "Constancia fiscal" is a part of RFC: only La empresa keeps a card.
    const { unmount } = render(<BibliotecaEsencial {...esencialProps({ query: "constancia" })} />);
    expect(screen.queryByRole("region", { name: "Abiertos recientemente" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Recursos" })).toBeNull();
    const empresa = within(block("La empresa")).getAllByRole("link");
    expect(empresa.map((link) => link.getAttribute("title"))).toEqual(["RFC"]);
    unmount();

    // Accent- and case-insensitive: "BITACORA" keeps the recent card and Formatos / Mis favoritos.
    const second = render(<BibliotecaEsencial {...esencialProps({ query: "BITACORA" })} />);
    expect(within(block("Abiertos recientemente")).getAllByRole("link")).toHaveLength(1);
    expect(recursoNames()).toEqual(["Formatos de obra", "Mis favoritos"]);
    second.unmount();

    render(<BibliotecaEsencial {...esencialProps({ query: "zzz" })} />);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.getByText("Sin resultados")).toBeTruthy();
    expect(screen.getByText("Nada en la biblioteca coincide con “zzz”.")).toBeTruthy();
  });

  it("no recents shows the muted line", () => {
    render(<BibliotecaEsencial {...esencialProps({ recents: [] })} />);
    const recientes = within(block("Abiertos recientemente"));
    expect(recientes.getByText("Aún no has abierto documentos.")).toBeTruthy();
    expect(recientes.queryByRole("list")).toBeNull();
  });

  it("shows at most four recents", () => {
    const recents = Array.from({ length: 6 }, (_, index) => ({ ...RECENTS[0], id: `doc-${index}`, title: `Documento ${index}` }));
    render(<BibliotecaEsencial {...esencialProps({ recents })} />);
    expect(within(block("Abiertos recientemente")).getAllByRole("link")).toHaveLength(4);
  });

  it("renders a skeleton per card while pending", () => {
    render(<BibliotecaEsencial {...esencialProps({ isPending: true })} />);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(3);
    expect(document.querySelectorAll("[data-slot='skeleton']")).toHaveLength(15);
  });
});
