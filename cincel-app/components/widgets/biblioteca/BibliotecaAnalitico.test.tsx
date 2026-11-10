// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";

import { bibliotecaData, bibliotecaFixture, makeLink, resourcesCapabilities, seededBibliotecaClient } from "@/components/biblioteca/biblioteca.fixtures";
import type { BibliotecaData } from "@/lib/biblioteca/load";
import { qk } from "@/lib/query/keys";
import { bibliotecaLinksOptions } from "@/lib/query/options/biblioteca";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { ResourceLink } from "@/lib/types/resource";

import { ANALITICO_CLEAR_FILTERS, ANALITICO_NO_MATCH, BibliotecaAnalitico } from "./BibliotecaAnalitico";
import type { BibliotecaLayoutProps } from "./types";

const nav = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/biblioteca",
  useSearchParams: () => nav.search,
}));

const actions = vi.hoisted(() => ({
  createResourceLinkAction: vi.fn(),
  deleteResourceLinkAction: vi.fn(),
  recordResourceOpenAction: vi.fn(),
}));
vi.mock("@/lib/actions/resources-actions", () => actions);

const pageData = vi.hoisted(() => ({ getBibliotecaPageData: vi.fn(), getMisVacacionesPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => pageData);

// The Drive browser needs the network; the quick-add tests paste URLs.
vi.mock("@/components/recursos/DrivePickerDialog", () => ({ default: () => null }));

const NOW = new Date("2026-11-09T18:00:00.000Z");

/** The index's hand-off: the layout props from the cached `biblioteca.links(null)`, as `BibliotecaIndex` builds them. */
function Harness(overrides: Partial<BibliotecaLayoutProps>) {
  const { data } = useQuery(bibliotecaLinksOptions(null));
  const props: BibliotecaLayoutProps = {
    links: data?.links ?? [],
    capabilities: data?.capabilities ?? null,
    showEmpresa: data?.capabilities.enterprise.canView ?? false,
    showRecursos: true,
    query: "",
    onQueryChange: () => {},
    recents: [],
    vacations: null,
    isPending: false,
    driveEnabled: false,
    now: NOW,
    today: "2026-11-09",
    ...overrides,
  };
  return <BibliotecaAnalitico {...props} />;
}

function renderAnalitico(links: ResourceLink[] = bibliotecaFixture(), options: { canViewEmpresa?: boolean } = {}, overrides: Partial<BibliotecaLayoutProps> = {}) {
  const client = seededBibliotecaClient(null, links, options);
  return renderWithQueryClient(<Harness {...overrides} />, { client });
}

function sectionCard(name: string) {
  return screen.getByRole("region", { name });
}

function sectionHeader(name: string) {
  return within(sectionCard(name)).getAllByRole("button")[0]!;
}

function urlParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

describe("BibliotecaAnalitico", () => {
  beforeEach(() => {
    nav.search = new URLSearchParams();
    window.history.replaceState(null, "", "/biblioteca");
    actions.recordResourceOpenAction.mockResolvedValue({ ok: true, data: { recorded: true } });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("expands only the first section with documents by default", () => {
    renderAnalitico();
    expect(sectionHeader("La empresa").getAttribute("aria-expanded")).toBe("true");
    expect(sectionHeader("Formatos de obra").getAttribute("aria-expanded")).toBe("false");
  });

  it("expand all writes abiertos", () => {
    renderAnalitico();
    fireEvent.click(screen.getByRole("button", { name: "Expandir todo" }));
    expect(urlParam("abiertos")?.split(",")).toEqual(["empresa", "formatos-obra", "plantillas-diseno", "formacion", "mis-documentos"]);
    expect(sectionHeader("Mis documentos").getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    expect(urlParam("abiertos")).toBe("");
    expect(sectionHeader("La empresa").getAttribute("aria-expanded")).toBe("false");
  });

  it("anchor expands section", () => {
    renderAnalitico();
    const anchors = screen.getByRole("navigation", { name: "Ir a" });
    fireEvent.click(within(anchors).getByRole("link", { name: /Mis documentos/ }));
    expect(sectionHeader("Mis documentos").getAttribute("aria-expanded")).toBe("true");
    expect(urlParam("abiertos")?.split(",")).toContain("mis-documentos");
  });

  it("quick-add adds row-new row", async () => {
    const created = makeLink({
      id: "nuevo",
      section: "formatos-obra",
      title: "Estimación 3",
      linkType: "web",
      url: "https://example.com/estimacion-3",
      updatedAt: NOW.toISOString(),
    });
    actions.createResourceLinkAction.mockResolvedValue({ ok: true, data: created });
    const links = bibliotecaFixture();
    pageData.getBibliotecaPageData.mockResolvedValue(bibliotecaData([...links, created], { canViewEmpresa: false }));
    const { client } = renderAnalitico(links, { canViewEmpresa: false });

    // Formatos de obra is the first section with documents, so its General group is open.
    const input = screen.getByLabelText("Agregar documento en General (sin proyecto)");
    fireEvent.change(input, { target: { value: "Estimación 3 https://example.com/estimacion-3" } });
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });

    await waitFor(() => expect(screen.getByRole("link", { name: "Estimación 3" })).toBeTruthy());
    expect(actions.createResourceLinkAction).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Estimación 3",
        section: "formatos-obra",
        linkType: "web",
        url: "https://example.com/estimacion-3",
        projectId: null,
        personalForId: null,
      }),
    );
    const row = screen.getByRole("link", { name: "Estimación 3" }).closest("tr")!;
    expect(row.className).toContain("row-new");
    expect(row.textContent).toContain("· nuevo");
    expect(row.textContent).toContain("hoy");
    expect(client.getQueryData<BibliotecaData>(qk.biblioteca.links(null))?.links.some((link) => link.id === "nuevo")).toBe(true);
  });

  it("no-match shows Quitar filtros", () => {
    nav.search = new URLSearchParams("clase=video");
    window.history.replaceState(null, "", "/biblioteca?clase=video");
    const onQueryChange = vi.fn();
    renderAnalitico(bibliotecaFixture(), {}, { query: "", onQueryChange });
    expect(screen.getByText(ANALITICO_NO_MATCH)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ANALITICO_CLEAR_FILTERS }));
    expect(screen.queryByText(ANALITICO_NO_MATCH)).toBeNull();
    expect(urlParam("clase")).toBeNull();
    expect(sectionCard("La empresa")).toBeTruthy();
  });

  it("hides opens columns without usage and never names who opened", () => {
    renderAnalitico();
    expect(screen.queryByText("Aperturas 30 d")).toBeNull();
    expect(screen.queryByText(/abiertos esta semana/i)).toBeNull();
  });

  it("offers quick-add only where the viewer may create", () => {
    const client = seededBibliotecaClient(null, bibliotecaFixture());
    client.setQueryData(qk.biblioteca.links(null), {
      ...bibliotecaData(bibliotecaFixture()),
      capabilities: { ...resourcesCapabilities(), corporate: { canCreate: false, canDelete: false, editScope: "owned_or_personal" } },
    } satisfies BibliotecaData);
    renderWithQueryClient(<Harness />, { client });
    // La empresa is open (enterprise.canCreate is false in the fixture): no quick-add line.
    expect(screen.queryByLabelText(/^Agregar documento en /)).toBeNull();
  });
});
