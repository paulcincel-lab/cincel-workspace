// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { bibliotecaFixture, makeLink, resourcesCapabilities } from "@/components/biblioteca/biblioteca.fixtures";
import type { RecentDocument } from "@/lib/stores/recent-docs-store";
import type { ResourceLink } from "@/lib/types/resource";
import type { MyVacations } from "@/lib/vacations/reads";

import { BibliotecaVisual, sectionFooter } from "./BibliotecaVisual";
import type { BibliotecaLayoutProps } from "./types";

// Drive iframes need a network; the viewer itself is covered by the Recursos workspace.
vi.mock("@/components/recursos/ResourcePreview", () => ({
  ResourcePreview: ({ link }: { link: { title: string } | null }) => <p data-testid="preview">{link?.title}</p>,
  DriveFilePreviewSheet: () => null,
}));

const NOW = new Date("2026-11-09T18:00:00.000Z");
const VACATIONS: MyVacations = {
  balance: { entitled: 20, taken: 6, pending: 2, available: 12 },
  requests: [{ id: "dic", from: "2026-12-22", to: "2026-12-26", kind: "vacaciones", comment: "", status: "aprobada" }],
};

function recent(id: string, overrides: Partial<RecentDocument> = {}): RecentDocument {
  return {
    id,
    title: `Documento ${id}`,
    url: `https://docs.google.com/document/d/doc${id}/edit`,
    openedAt: "2026-11-09T17:55:00.000Z",
    section: "formatos-obra",
    ...overrides,
  };
}

const RECENTS: RecentDocument[] = [
  recent("bitacora", { title: "Bitácora de obra", url: "https://docs.google.com/document/d/docbitacora/edit" }),
  recent("manual-2", { title: "Cómo abrimos un proyecto", section: "empresa", openedAt: "2026-11-08T15:00:00.000Z" }),
];

function library(): ResourceLink[] {
  return [
    ...bibliotecaFixture(),
    makeLink({ id: "p1", section: "plantillas-diseno", title: "Carátula de proyecto", createdAt: "2026-11-07T16:00:00.000Z", updatedAt: "2026-11-07T16:00:00.000Z" }),
    makeLink({ id: "p2", section: "plantillas-diseno", title: "Lámina de presentación", createdAt: "2026-11-06T16:00:00.000Z", updatedAt: "2026-11-08T16:00:00.000Z" }),
    makeLink({ id: "p3", section: "plantillas-diseno", title: "Render base", updatedAt: "2026-10-20T16:00:00.000Z" }),
    makeLink({ id: "p4", section: "plantillas-diseno", title: "Plano tipo", updatedAt: "2026-09-01T16:00:00.000Z" }),
  ];
}

function visualProps(overrides: Partial<BibliotecaLayoutProps> = {}): BibliotecaLayoutProps {
  return {
    links: library(),
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

function headings(): string[] {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
}

describe("BibliotecaVisual", () => {
  afterEach(() => cleanup());

  it("renders hero, recientes, secciones, destacadas in order", () => {
    render(<BibliotecaVisual {...visualProps()} />);
    expect(headings()).toEqual(["Tu biblioteca de un vistazo", "Abiertos recientemente", "Secciones", "Plantillas destacadas"]);

    const hero = screen.getByRole("region", { name: "Tu biblioteca de un vistazo" });
    expect(within(hero).getByRole("img", { name: "Documentos por sección: 11 en total" })).toBeTruthy();
    expect(hero.textContent).toContain("2 documentos nuevos esta semana");
    expect(within(hero).queryByText("Nuevo en el manual")).toBeNull();

    const secciones = within(screen.getByRole("region", { name: "Secciones" }));
    const cards = secciones.getAllByRole("link");
    expect(cards.map((card) => card.getAttribute("href"))).toEqual([
      "/biblioteca/plantillas-diseno",
      "/biblioteca/formatos-obra",
      "/biblioteca/formacion",
      "/biblioteca/empresa/manual-de-la-empresa",
      "/biblioteca/mis-documentos",
      "/biblioteca/vacaciones",
    ]);
    expect(cards[0].getAttribute("aria-label")).toBe("Plantillas de diseño · 4 documentos · 2 nuevas · act. 8 nov");
    expect(cards[1].getAttribute("aria-label")).toBe("Formatos de obra · 3 documentos · act. 5 nov");
    expect(cards[2].getAttribute("aria-label")).toBe("Formación · 0 documentos · Sin documentos");
    expect(cards[4].getAttribute("aria-label")).toBe("Mis documentos · 1 documento · 1 favorito");
    expect(cards[5].getAttribute("aria-label")).toBe("Mis vacaciones · 12 días · Próximas: 22–26 dic");

    const destacadas = screen.getByRole("region", { name: "Plantillas destacadas" });
    expect(within(destacadas).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Lámina de presentación",
      "Carátula de proyecto",
      "Render base",
    ]);
    expect(within(destacadas).getByRole("link", { name: "Ver las 4 →" }).getAttribute("href")).toBe("/biblioteca/plantillas-diseno");
    expect(within(destacadas).getByRole("link", { name: "Usar plantilla: Render base" }).getAttribute("href")).toBe(
      "https://docs.google.com/document/d/docp3/copy",
    );
  });

  it("names each recent card with its title and meta", () => {
    render(<BibliotecaVisual {...visualProps()} />);
    const carousel = within(screen.getByRole("region", { name: "Abiertos recientemente" }));
    const manual = carousel.getByRole("link", { name: "Cómo abrimos un proyecto · La empresa · ayer" });
    expect(manual.getAttribute("href")).toBe("/biblioteca/empresa/manual-de-la-empresa?parte=manual-2");
    expect(carousel.getByRole("link", { name: "Bitácora de obra · Formatos de obra · hace 5 min" })).toBeTruthy();
  });

  it("shows empty recents copy", () => {
    render(<BibliotecaVisual {...visualProps({ recents: [] })} />);
    const carousel = within(screen.getByRole("region", { name: "Abiertos recientemente" }));
    expect(carousel.getByText("Aún no has abierto documentos.")).toBeTruthy();
    expect(carousel.getByText("Abre un documento de Google para verlo aquí.")).toBeTruthy();
    expect(carousel.queryByRole("button", { name: "Anteriores" })).toBeNull();
    expect(carousel.queryByRole("button", { name: "Siguientes" })).toBeNull();
  });

  it("disables arrows at the ends", () => {
    render(<BibliotecaVisual {...visualProps({ recents: [RECENTS[0]] })} />);
    const carousel = within(screen.getByRole("region", { name: "Abiertos recientemente" }));
    const prev = carousel.getByRole("button", { name: "Anteriores" });
    const next = carousel.getByRole("button", { name: "Siguientes" });
    // One card fits: the track has nothing to scroll.
    expect(prev.getAttribute("aria-disabled")).toBe("true");
    expect(next.getAttribute("aria-disabled")).toBe("true");
    const before = document.activeElement;
    fireEvent.click(next);
    expect(document.activeElement).toBe(before);
  });

  it("shows the manual callout for a part created within 14 days", () => {
    const links = [
      ...library(),
      makeLink({ id: "m-new", section: "empresa", title: "Manual de la empresa · Seguridad en obra", createdAt: "2026-11-05T16:00:00.000Z" }),
    ];
    render(<BibliotecaVisual {...visualProps({ links })} />);
    const hero = within(screen.getByRole("region", { name: "Tu biblioteca de un vistazo" }));
    expect(hero.getByText("Nuevo en el manual")).toBeTruthy();
    expect(hero.getByText("Seguridad en obra")).toBeTruthy();
    expect(hero.getByRole("link", { name: "Leer ahora →" }).getAttribute("href")).toBe(
      "/biblioteca/empresa/manual-de-la-empresa?parte=m-new",
    );
  });

  it("hides Empresa without capability", () => {
    render(<BibliotecaVisual {...visualProps({ showEmpresa: false })} />);
    const secciones = within(screen.getByRole("region", { name: "Secciones" }));
    expect(secciones.queryByRole("link", { name: /^La empresa/ })).toBeNull();
    expect(secciones.getByRole("link", { name: /^Mis vacaciones/ })).toBeTruthy();
    const hero = screen.getByRole("region", { name: "Tu biblioteca de un vistazo" });
    expect(hero.textContent).not.toContain("La empresa");
    // The Empresa recent is not shown either.
    expect(screen.queryByRole("link", { name: /Cómo abrimos un proyecto/ })).toBeNull();
  });

  it("shows only Empresa and Mis vacaciones without canViewResources", () => {
    render(<BibliotecaVisual {...visualProps({ showRecursos: false, links: bibliotecaFixture().filter((l) => l.section === "empresa") })} />);
    const secciones = within(screen.getByRole("region", { name: "Secciones" }));
    expect(secciones.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/biblioteca/empresa/manual-de-la-empresa",
      "/biblioteca/vacaciones",
    ]);
    expect(screen.queryByRole("region", { name: "Plantillas destacadas" })).toBeNull();
  });

  it("search hides hero and templates", () => {
    render(<BibliotecaVisual {...visualProps({ query: "bitacora" })} />);
    expect(headings()).toEqual(["Abiertos recientemente", "Secciones"]);
    const secciones = within(screen.getByRole("region", { name: "Secciones" }));
    expect(secciones.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/biblioteca/formatos-obra"]);
    const carousel = within(screen.getByRole("region", { name: "Abiertos recientemente" }));
    expect(carousel.getAllByRole("link")).toHaveLength(1);
  });

  it("search with no match shows Sin resultados", () => {
    render(<BibliotecaVisual {...visualProps({ query: "zzz" })} />);
    expect(screen.getByText("Sin resultados")).toBeTruthy();
    expect(screen.getByText("Nada en la biblioteca coincide con “zzz”.")).toBeTruthy();
  });

  it("renders skeletons while pending", () => {
    render(<BibliotecaVisual {...visualProps({ isPending: true })} />);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(document.querySelectorAll("[data-slot='skeleton']")).toHaveLength(11);
  });

  it("opens the template preview", () => {
    render(<BibliotecaVisual {...visualProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Vista previa: Render base" }));
    expect(screen.getByTestId("preview").textContent).toBe("Render base");
  });
});

describe("sectionFooter", () => {
  const overview = { total: 0, newThisWeek: 0, sections: [], empresa: null, manualHighlight: null, favoritesCount: 2 };
  const stat = (key: "formatos-obra" | "plantillas-diseno" | "empresa" | "mis-documentos" | "mis-vacaciones", count: number, newCount: number) => ({
    key,
    title: key,
    description: "",
    iconName: "folder",
    href: "/",
    count,
    newCount,
    updatedAt: "2026-11-04T16:00:00.000Z",
    color: null,
  });

  it("agrees in number and gender", () => {
    const ctx = { overview, manualUpdated: false, vacation: null };
    expect(sectionFooter(stat("formatos-obra", 3, 1), ctx)).toBe("1 nuevo · act. 4 nov");
    expect(sectionFooter(stat("formatos-obra", 3, 2), ctx)).toBe("2 nuevos · act. 4 nov");
    expect(sectionFooter(stat("plantillas-diseno", 3, 1), ctx)).toBe("1 nueva · act. 4 nov");
    expect(sectionFooter(stat("plantillas-diseno", 3, 3), ctx)).toBe("3 nuevas · act. 4 nov");
    expect(sectionFooter(stat("mis-documentos", 1, 0), ctx)).toBe("2 favoritos");
    expect(sectionFooter(stat("formatos-obra", 0, 0), ctx)).toBe("Sin documentos");
  });

  it("covers Empresa and Mis vacaciones", () => {
    expect(sectionFooter(stat("empresa", 2, 0), { overview, manualUpdated: true, vacation: null })).toBe("Manual actualizado");
    expect(sectionFooter(stat("empresa", 2, 0), { overview, manualUpdated: false, vacation: null })).toBe("act. 4 nov");
    expect(sectionFooter(stat("mis-vacaciones", 0, 0), { overview, manualUpdated: false, vacation: { available: 12, next: null } })).toBe(
      "Sin vacaciones próximas",
    );
    expect(
      sectionFooter(stat("mis-vacaciones", 0, 0), {
        overview,
        manualUpdated: false,
        vacation: { available: 12, next: { from: "2026-12-28", to: "2027-01-03" } },
      }),
    ).toBe("Próximas: 28 dic–3 ene");
    expect(sectionFooter(stat("mis-vacaciones", 0, 0), { overview, manualUpdated: false, vacation: null })).toBe("Ver saldo y solicitudes");
  });
});
