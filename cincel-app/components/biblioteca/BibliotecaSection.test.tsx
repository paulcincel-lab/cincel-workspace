// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { FiltersBarProps } from "@/components/patterns/FiltersBar";
import type { ListPageProps } from "@/components/patterns/ListPage";

import { bibliotecaFixture, makeLink } from "./biblioteca.fixtures";
import { BibliotecaSection } from "./BibliotecaSection";

const actions = vi.hoisted(() => ({
  createResourceLinkAction: vi.fn(),
  deleteResourceLinkAction: vi.fn(),
}));
vi.mock("@/lib/actions/resources-actions", () => actions);

// Plain renderings of the pattern inputs: the test reads what the section hands them.
vi.mock("@/components/patterns/ListPage", () => ({
  ListPage: ({ header, filters, spec, empty }: ListPageProps) => {
    if (spec.kind !== "table") return null;
    return (
      <div>
        <h1>{header.title}</h1>
        <nav aria-label="Ruta">{(header.breadcrumb ?? []).map((b) => b.label).join(" / ")}</nav>
        {filters}
        {spec.data.rows.length === 0 ? (
          <p>{empty?.title}</p>
        ) : (
          <table>
            <thead>
              <tr>
                {spec.data.columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.data.rows.map((row) => (
                <tr key={String(row.id)}>
                  {spec.data.columns.map((c) => (
                    <td key={c.key}>{spec.renderCell?.(c.key, row) ?? String(row[c.key] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  },
}));
vi.mock("@/components/patterns/FiltersBar", () => ({
  FiltersBar: ({ chips }: FiltersBarProps) => (
    <div>
      {(chips ?? []).map((chip) => (
        <a key={chip.key} href={chip.href} aria-pressed={chip.pressed}>
          {chip.label}
        </a>
      ))}
    </div>
  ),
}));
vi.mock("@/components/recursos/ResourcePreview", () => ({
  ResourcePreview: ({ link }: { link: { title: string } | null }) => <div data-testid="preview">{link?.title}</div>,
  DriveFilePreviewSheet: () => null,
}));

function rowOf(name: string) {
  return screen.getByRole("button", { name }).closest("tr")!;
}

describe("BibliotecaSection", () => {
  beforeEach(() => {
    window.localStorage.clear();
    actions.createResourceLinkAction.mockReset();
    actions.deleteResourceLinkAction.mockReset();
  });
  afterEach(() => cleanup());

  it("lists the section rows with breadcrumb and no views / downloads columns", () => {
    render(<BibliotecaSection section="formatos-obra" links={bibliotecaFixture()} viewerId="staff-ana" canManageFavorites />);
    expect(screen.getByRole("heading", { name: "Formatos de obra" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Ruta" }).textContent).toBe("Biblioteca / Recursos / Formatos de obra");
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Favorito", "Nombre", "Tipo", "Tramo", "Actualizado", "Acciones"]);
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("builds tipo and tramo filter chips as links keeping the other filter", () => {
    render(<BibliotecaSection section="formatos-obra" links={bibliotecaFixture()} tipo="drive_file" tramo={null} />);
    const carpeta = screen.getByRole("link", { name: "Carpeta" });
    expect(carpeta.getAttribute("href")).toBe("/biblioteca/formatos-obra?tipo=drive_folder");
    expect(screen.getByRole("link", { name: "Archivo" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link", { name: "Construcción" }).getAttribute("href")).toBe("/biblioteca/formatos-obra?tipo=drive_file&tramo=construccion");
    expect(screen.queryByRole("button", { name: "Acta de entrega-recepción" })).toBeNull();
  });

  it("marks a row as favorite with a personal 'Mis favoritos' link", async () => {
    const links = bibliotecaFixture();
    actions.createResourceLinkAction.mockResolvedValue(
      makeLink({ id: "fav-new", section: "mis-favoritos", title: "Levantamiento del sitio", url: links[5].url, personalFor: { id: "staff-ana", name: "Ana Ríos" } }),
    );
    render(<BibliotecaSection section="formatos-obra" links={links} viewerId="staff-ana" canManageFavorites />);
    const toggle = screen.getByRole("button", { name: "Marcar Levantamiento del sitio como favorito" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Quitar Levantamiento del sitio de favoritos" }).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(actions.createResourceLinkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        section: "mis-favoritos",
        title: "Levantamiento del sitio",
        url: links[5].url,
        ownerId: "staff-ana",
        personalForId: "staff-ana",
      }),
    );
  });

  it("removes the favorite link when the star is toggled off", async () => {
    actions.deleteResourceLinkAction.mockResolvedValue(undefined);
    render(<BibliotecaSection section="formatos-obra" links={bibliotecaFixture()} viewerId="staff-ana" canManageFavorites />);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Bitácora de obra de favoritos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Marcar Bitácora de obra como favorito" })).toBeTruthy());
    expect(actions.deleteResourceLinkAction).toHaveBeenCalledWith("fav-bitacora");
  });

  it("shows the mapped error copy when the toggle fails", async () => {
    actions.createResourceLinkAction.mockRejectedValue(new Error("FORBIDDEN: resource create"));
    render(<BibliotecaSection section="formatos-obra" links={bibliotecaFixture()} viewerId="staff-ana" canManageFavorites />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar Levantamiento del sitio como favorito" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
  });

  it("shows the star read-only without the favorites capability and never calls an action", () => {
    render(<BibliotecaSection section="formatos-obra" links={bibliotecaFixture()} viewerId="staff-ana" canManageFavorites={false} />);
    expect(screen.queryByRole("button", { name: /favorito/ })).toBeNull();
    expect(within(rowOf("Bitácora de obra")).getByRole("img", { name: "Favorito" })).toBeTruthy();
    expect(actions.createResourceLinkAction).not.toHaveBeenCalled();
  });

  it("opens a row in the viewer and remembers it as recent; downloads only with Drive", () => {
    render(<BibliotecaSection section="formatos-obra" links={bibliotecaFixture()} driveEnabled />);
    expect(within(rowOf("Bitácora de obra")).getByRole("link", { name: "Descargar PDF: Bitácora de obra" }).getAttribute("href")).toBe(
      "/api/google/drive/file/docbitacora/content",
    );
    expect(within(rowOf("Acta de entrega-recepción")).queryByRole("link", { name: /Descargar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Bitácora de obra" }));
    const stored = JSON.parse(window.localStorage.getItem("cincel.resources.recent-docs.v1") ?? "[]");
    expect(stored[0]).toMatchObject({ id: "bitacora", section: "formatos-obra" });
  });
});
