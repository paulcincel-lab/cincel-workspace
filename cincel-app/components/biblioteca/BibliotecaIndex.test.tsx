// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { BibliotecaLayoutProps } from "@/components/widgets/biblioteca/types";
import type { BibliotecaData } from "@/lib/biblioteca/load";
import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { useRecentDocs } from "@/lib/stores/recent-docs-store";
import { settle } from "@/tests/helpers/settle";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { ResourceLink } from "@/lib/types/resource";
import type { MyVacations } from "@/lib/vacations/reads";

import { bibliotecaFixture, seededBibliotecaClient } from "./biblioteca.fixtures";
import { BIBLIOTECA_SEARCH_DEBOUNCE_MS, BibliotecaIndex } from "./BibliotecaIndex";

const nav = vi.hoisted(() => ({ search: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/biblioteca",
  useSearchParams: () => nav.search,
}));
vi.mock("@/lib/actions/resources-actions", () => ({
  createResourceLinkAction: vi.fn(),
  deleteResourceLinkAction: vi.fn(),
  recordResourceOpenAction: vi.fn().mockResolvedValue({ ok: true, data: { recorded: true } }),
}));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => ({
  getBibliotecaPageData: vi.fn(),
  getMisVacacionesPageData: vi.fn(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));
vi.mock("@/components/recursos/ResourcePreview", () => ({ ResourcePreview: () => null, DriveFilePreviewSheet: () => null }));
// The other two layouts have their own tests; here they only show what the index hands them.
vi.mock("@/components/widgets/biblioteca/BibliotecaEsencial", () => ({
  BibliotecaEsencial: (props: BibliotecaLayoutProps) => (
    <p data-testid="esencial">{`${props.links.length} · ${props.query} · ${props.vacations?.balance.available ?? "-"}`}</p>
  ),
}));
vi.mock("@/components/widgets/biblioteca/BibliotecaAnalitico", () => ({
  BibliotecaAnalitico: (props: BibliotecaLayoutProps) => (
    <p data-testid="analitico">{`${props.links.length} · ${props.query} · ${props.showEmpresa}`}</p>
  ),
}));

const RECENT_KEY = "cincel.resources.recent-docs.v1";
const VACATIONS: MyVacations = { balance: { entitled: 20, taken: 6, pending: 2, available: 12 }, requests: [] };

/** The index as the page renders it: `biblioteca.links(null)` and `me.vacations` already in the cache. */
function renderIndex(
  links: ResourceLink[],
  options: { canViewEmpresa?: boolean; style?: PresentationStyle; canWrite?: boolean } = {},
) {
  const client = seededBibliotecaClient(null, links, options);
  client.setQueryData(qk.me.vacations(), VACATIONS);
  if (options.canWrite === false) {
    client.setQueryData<BibliotecaData>(qk.biblioteca.links(null), (data) =>
      data
        ? {
            ...data,
            capabilities: {
              ...data.capabilities,
              canManageFavoritesSection: false,
              corporate: { ...data.capabilities.corporate, canCreate: false, canDelete: false },
            },
          }
        : data,
    );
  }
  return renderWithQueryClient(
    <StyleProvider style={options.style ?? "visual"} scope="staff">
      <BibliotecaIndex />
    </StyleProvider>,
    { client },
  );
}

describe("BibliotecaIndex", () => {
  beforeEach(() => {
    nav.search = new URLSearchParams();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/biblioteca");
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the header copy and the Visual layout", () => {
    renderIndex(bibliotecaFixture());
    expect(screen.getByRole("heading", { level: 1, name: "Biblioteca" })).toBeTruthy();
    expect(screen.getByText("Documentos de la empresa, formatos y tus archivos.")).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: "Buscar documentos" });
    expect(search.getAttribute("placeholder")).toBe("Buscar documentos");
    expect(screen.getByRole("button", { name: "Subir documento" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Tu biblioteca de un vistazo" })).toBeTruthy();
    const formatos = within(screen.getByRole("region", { name: "Secciones" })).getByRole("link", { name: /^Formatos de obra/ });
    expect(formatos.getAttribute("href")).toBe("/biblioteca/formatos-obra");
  });

  it("hands the same data to Esencial and moves the search out of the Analítico header", () => {
    renderIndex(bibliotecaFixture(), { style: "esencial" });
    expect(screen.getByTestId("esencial").textContent).toBe("8 ·  · 12");
    expect(screen.getByRole("searchbox", { name: "Buscar documentos" })).toBeTruthy();
    cleanup();

    renderIndex(bibliotecaFixture(), { style: "analitico" });
    expect(screen.getByTestId("analitico").textContent).toBe("8 ·  · true");
    expect(screen.getByText("Por sección y proyecto, con uso y antigüedad de cada documento.")).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Subir documento" })).toBeTruthy();
  });

  it("reads the search from ?q= on load", () => {
    nav.search = new URLSearchParams("q=bitácora");
    renderIndex(bibliotecaFixture());
    expect((screen.getByRole("searchbox", { name: "Buscar documentos" }) as HTMLInputElement).value).toBe("bitácora");
    expect(screen.queryByRole("region", { name: "Tu biblioteca de un vistazo" })).toBeNull();
    const secciones = within(screen.getByRole("region", { name: "Secciones" }));
    expect(secciones.getByRole("link", { name: /^Formatos de obra/ })).toBeTruthy();
    expect(secciones.queryByRole("link", { name: /^Formación/ })).toBeNull();
  });

  it("writes the search to ?q= with replace after 200 ms, keeping other parameters", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/biblioteca?estilo=visual");
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    renderIndex(bibliotecaFixture());
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar documentos" }), { target: { value: "acta" } });
    act(() => vi.advanceTimersByTime(BIBLIOTECA_SEARCH_DEBOUNCE_MS - 1));
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe("?estilo=visual&q=acta");
    expect(push).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar documentos" }), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(BIBLIOTECA_SEARCH_DEBOUNCE_MS));
    expect(window.location.search).toBe("?estilo=visual");
    replace.mockRestore();
    push.mockRestore();
  });

  it("opens Subir documento in a sheet with Mis documentos selected", async () => {
    renderIndex(bibliotecaFixture());
    fireEvent.click(screen.getByRole("button", { name: "Subir documento" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Mis documentos")).toBeTruthy();
    expect(within(dialog).getByLabelText("Nombre")).toBeTruthy();
    expect(within(dialog).getByLabelText("Enlace de Google Drive")).toBeTruthy();
  });

  it("hides Subir documento for a viewer who may not add documents", () => {
    renderIndex(bibliotecaFixture(), { canWrite: false });
    expect(screen.queryByRole("button", { name: "Subir documento" })).toBeNull();
  });

  it("reads 'Abiertos recientemente' from the existing localStorage key", async () => {
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
    await act(async () => {
      await useRecentDocs.persist.rehydrate();
    });
    renderIndex(bibliotecaFixture());
    await settle();
    const recent = within(screen.getByRole("region", { name: "Abiertos recientemente" }));
    const link = recent.getByRole("link", { name: /^Cómo abrimos un proyecto · La empresa/ });
    expect(link.getAttribute("href")).toBe("/biblioteca/empresa/manual-de-la-empresa?parte=manual-2");
    act(() => useRecentDocs.getState().clear());
  });

  it("hides Empresa when the viewer can't see it", () => {
    renderIndex(bibliotecaFixture(), { canViewEmpresa: false });
    const secciones = within(screen.getByRole("region", { name: "Secciones" }));
    expect(secciones.queryByRole("link", { name: /^La empresa/ })).toBeNull();
    expect(secciones.getByRole("link", { name: /^Mis vacaciones · 12 días/ })).toBeTruthy();
  });
});
