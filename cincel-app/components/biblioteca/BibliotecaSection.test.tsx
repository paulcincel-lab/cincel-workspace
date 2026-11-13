// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FiltersBarProps } from "@/components/patterns/FiltersBar";
import type { ListPageProps } from "@/components/patterns/ListPage";
import type { BibliotecaData } from "@/lib/biblioteca/load";
import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { ResourceLink } from "@/lib/types/resource";

import { bibliotecaData, bibliotecaFixture, makeLink, seededBibliotecaClient } from "./biblioteca.fixtures";
import { BibliotecaSection, optimisticFavoriteId, type BibliotecaSectionProps } from "./BibliotecaSection";

const actions = vi.hoisted(() => ({
  createResourceLinkAction: vi.fn(),
  deleteResourceLinkAction: vi.fn(),
  recordResourceOpenAction: vi.fn().mockResolvedValue({ ok: true, data: { recorded: true } }),
}));
vi.mock("@/lib/actions/resources-actions", () => actions);

const pageData = vi.hoisted(() => ({ getBibliotecaPageData: vi.fn(), getMisVacacionesPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => pageData);

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
        <a key={chip.key} href={chip.href} role="button" aria-pressed={chip.pressed}>
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

/** What `biblioteca.links('formatos-obra')` ships: the section's rows plus the viewer's favorites. */
function sectionLinks(): ResourceLink[] {
  return bibliotecaFixture().filter((link) => link.section === "formatos-obra" || link.section === "mis-favoritos");
}

function renderSection(
  props: Partial<BibliotecaSectionProps> = {},
  options: { links?: ResourceLink[]; canManageFavorites?: boolean; driveEnabled?: boolean } = {},
) {
  const client = seededBibliotecaClient("formatos-obra", options.links ?? sectionLinks(), {
    canManageFavorites: options.canManageFavorites ?? true,
    driveEnabled: options.driveEnabled ?? false,
  });
  return renderWithQueryClient(<BibliotecaSection section="formatos-obra" {...props} />, { client });
}

function cachedIds(client: ReturnType<typeof renderSection>["client"]): string[] {
  return (client.getQueryData<BibliotecaData>(qk.biblioteca.links("formatos-obra"))?.links ?? []).map((link) => link.id);
}

function rowOf(name: string) {
  return screen.getByRole("button", { name }).closest("tr")!;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("BibliotecaSection", () => {
  beforeEach(() => {
    actions.createResourceLinkAction.mockReset();
    actions.deleteResourceLinkAction.mockReset();
    pageData.getBibliotecaPageData.mockReset();
  });
  afterEach(() => cleanup());

  it("lists the section rows with breadcrumb and no views / downloads columns", () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Formatos de obra" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Ruta" }).textContent).toBe("Biblioteca / Recursos / Formatos de obra");
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Favorito", "Nombre", "Tipo", "Etapa", "Actualizado", "Acciones"]);
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });

  it("builds tipo and etapa filter chips as links keeping the other filter", () => {
    renderSection({ tipo: "drive_file", etapa: null });
    const carpeta = screen.getByRole("button", { name: "Carpeta" });
    expect(carpeta.getAttribute("href")).toBe("/biblioteca/formatos-obra?tipo=drive_folder");
    expect(screen.getByRole("button", { name: "Archivo" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Construcción" }).getAttribute("href")).toBe("/biblioteca/formatos-obra?tipo=drive_file&etapa=construccion");
    expect(screen.queryByRole("button", { name: "Acta de entrega-recepción" })).toBeNull();
  });

  it("marks a row as favorite at once (optimistic), then keeps the created link", async () => {
    const links = sectionLinks();
    const levantamiento = links.find((link) => link.id === "levantamiento")!;
    const created = makeLink({ id: "fav-new", section: "mis-favoritos", title: "Levantamiento del sitio", url: levantamiento.url, personalFor: { id: "staff-ana", name: "Ana Ríos" } });
    const call = deferred<{ ok: true; data: ResourceLink }>();
    actions.createResourceLinkAction.mockReturnValue(call.promise);
    const { client } = renderSection({}, { links });

    const toggle = screen.getByRole("button", { name: "Marcar Levantamiento del sitio como favorito" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);

    // Before the server answers: the star is on and the cache holds the optimistic favorite.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Quitar Levantamiento del sitio de favoritos" }).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(cachedIds(client)).toContain(optimisticFavoriteId(levantamiento));

    call.resolve({ ok: true, data: created });
    await waitFor(() => expect(cachedIds(client)).toContain("fav-new"));
    expect(cachedIds(client)).not.toContain(optimisticFavoriteId(levantamiento));
    expect(actions.createResourceLinkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        section: "mis-favoritos",
        title: "Levantamiento del sitio",
        url: levantamiento.url,
        ownerId: "staff-ana",
        personalForId: "staff-ana",
      }),
    );
    // One POST: the screen is already exact, nothing refetches.
    expect(pageData.getBibliotecaPageData).not.toHaveBeenCalled();
  });

  it("removes the favorite at once when the star is toggled off", async () => {
    const call = deferred<{ ok: true; data: null }>();
    actions.deleteResourceLinkAction.mockReturnValue(call.promise);
    const { client } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Bitácora de obra de favoritos" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Marcar Bitácora de obra como favorito" })).toBeTruthy());
    expect(cachedIds(client)).not.toContain("fav-bitacora");
    call.resolve({ ok: true, data: null });
    await waitFor(() => expect(actions.deleteResourceLinkAction).toHaveBeenCalledWith("fav-bitacora"));
    expect(cachedIds(client)).not.toContain("fav-bitacora");
  });

  it("marks every other Biblioteca screen stale after a toggle (the biblioteca.links prefix)", async () => {
    actions.deleteResourceLinkAction.mockResolvedValue({ ok: true, data: null });
    const { client } = renderSection();
    client.setQueryData(qk.biblioteca.links(null), bibliotecaData(bibliotecaFixture()));
    client.setQueryData(qk.biblioteca.links("mis-favoritos"), bibliotecaData([]));
    fireEvent.click(screen.getByRole("button", { name: "Quitar Bitácora de obra de favoritos" }));
    await waitFor(() => expect(client.getQueryState(qk.biblioteca.links(null))?.isInvalidated).toBe(true));
    expect(client.getQueryState(qk.biblioteca.links("mis-favoritos"))?.isInvalidated).toBe(true);
    expect(pageData.getBibliotecaPageData).not.toHaveBeenCalled();
  });

  it("rolls the star back and shows the mapped error copy when the create fails", async () => {
    actions.createResourceLinkAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: resource create" });
    const { client } = renderSection();
    const before = cachedIds(client);
    fireEvent.click(screen.getByRole("button", { name: "Marcar Levantamiento del sitio como favorito" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
    expect(screen.getByRole("button", { name: "Marcar Levantamiento del sitio como favorito" }).getAttribute("aria-pressed")).toBe("false");
    expect(cachedIds(client)).toEqual(before);
  });

  it("rolls the removal back when the delete fails", async () => {
    actions.deleteResourceLinkAction.mockResolvedValue({ ok: false, error: "FORBIDDEN: resource delete" });
    const { client } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Bitácora de obra de favoritos" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quitar Bitácora de obra de favoritos" }).getAttribute("aria-pressed")).toBe("true");
    expect(cachedIds(client)).toContain("fav-bitacora");
  });

  it("shows the star read-only without the favorites capability and never calls an action", () => {
    renderSection({}, { canManageFavorites: false });
    expect(screen.queryByRole("button", { name: /favorito/ })).toBeNull();
    expect(within(rowOf("Bitácora de obra")).getByRole("img", { name: "Favorito" })).toBeTruthy();
    expect(actions.createResourceLinkAction).not.toHaveBeenCalled();
  });

  it("opens a row in the viewer and remembers it as recent; downloads only with Drive", () => {
    renderSection({}, { driveEnabled: true });
    expect(within(rowOf("Bitácora de obra")).getByRole("link", { name: "Descargar PDF: Bitácora de obra" }).getAttribute("href")).toBe(
      "/api/google/drive/file/docbitacora/content",
    );
    expect(within(rowOf("Acta de entrega-recepción")).queryByRole("link", { name: /Descargar/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Bitácora de obra" }));
    const stored = JSON.parse(window.localStorage.getItem("cincel.resources.recent-docs.v1") ?? "[]");
    expect(stored[0]).toMatchObject({ id: "bitacora", section: "formatos-obra" });
  });
});
