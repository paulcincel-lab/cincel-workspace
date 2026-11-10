// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import axe from "axe-core";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { documentToc, empresaDoc, empresaDocLinks } from "@/lib/biblioteca/catalog";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";
import { settle } from "@/tests/helpers/settle";

import { bibliotecaFixture, resourcesCapabilities, seededBibliotecaClient } from "./biblioteca.fixtures";
import { BibliotecaIndex } from "./BibliotecaIndex";
import { BibliotecaSection } from "./BibliotecaSection";
import { DocumentReader } from "./DocumentReader";
import { BibliotecaEsencial } from "@/components/widgets/biblioteca/BibliotecaEsencial";
import { BibliotecaVisual } from "@/components/widgets/biblioteca/BibliotecaVisual";
import { BibliotecaAnalitico } from "@/components/widgets/biblioteca/BibliotecaAnalitico";
import type { BibliotecaLayoutProps } from "@/components/widgets/biblioteca/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/biblioteca",
  useSearchParams: () => new URLSearchParams(),
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
// Drive iframes need a network; the viewer itself is covered by the Recursos workspace.
vi.mock("@/components/recursos/ResourcePreview", () => ({
  ResourcePreview: ({ link }: { link: { title: string } | null }) => <p>{link?.title}</p>,
  DriveFilePreviewSheet: () => null,
}));

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are checked by the theme presets test (lib/ui/contrast.ts).
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function themed(theme: ThemeId, mode: (typeof MODES)[number], style: PresentationStyle, children: ReactNode) {
  return (
    <div data-theme-id={theme} data-theme={mode} data-style={style} className={mode === "dark" ? "dark" : undefined}>
      <StyleProvider style={style} scope="staff">
        <main>{children}</main>
      </StyleProvider>
    </div>
  );
}

const links = bibliotecaFixture();
const manual = empresaDoc("manual-de-la-empresa")!;
const parts = empresaDocLinks(links, manual.slug);

const SCREENS: { name: string; client: () => QueryClient; node: () => ReactNode }[] = [
  { name: "index", client: () => seededBibliotecaClient(null, links), node: () => <BibliotecaIndex /> },
  {
    name: "sección",
    client: () => seededBibliotecaClient("formatos-obra", links, { driveEnabled: true }),
    node: () => <BibliotecaSection section="formatos-obra" />,
  },
  {
    name: "documento",
    client: () => seededBibliotecaClient("empresa", links, { driveEnabled: true }),
    node: () => (
      <DocumentReader
        doc={parts[0]}
        toc={documentToc(parts, manual)}
        companyDoc={{ slug: manual.slug, title: manual.title, description: manual.description }}
      />
    ),
  },
];

describe("Biblioteca accessibility", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${theme}, ${mode}, every style)`, async () => {
        for (const style of STYLES) {
          for (const screen of SCREENS) {
            const client = screen.client();
            const { container, unmount } = renderWithQueryClient(themed(theme, mode, style, screen.node()), { client });
            await settle(client);
            expect({ screen: screen.name, style, violations: await seriousViolations(container) }).toEqual({
              screen: screen.name,
              style,
              violations: [],
            });
            unmount();
          }
        }
      });
    }
  }
});

describe("Biblioteca Esencial accessibility", () => {
  afterEach(() => cleanup());

  /** What `BibliotecaIndex` hands the Esencial layout for the fixture library. */
  function esencialProps(): BibliotecaLayoutProps {
    return {
      links,
      capabilities: resourcesCapabilities(),
      showEmpresa: true,
      showRecursos: true,
      query: "",
      onQueryChange: () => {},
      recents: [
        {
          id: "bitacora",
          title: "Bitácora de obra",
          url: "https://docs.google.com/document/d/docbitacora/edit",
          openedAt: "2026-11-09T17:55:00.000Z",
          section: "formatos-obra",
        },
      ],
      vacations: { balance: { entitled: 20, taken: 6, pending: 2, available: 12 }, requests: [] },
      isPending: false,
      driveEnabled: false,
      now: new Date("2026-11-09T18:00:00.000Z"),
      today: "2026-11-09",
    };
  }

  for (const mode of MODES) {
    it(`Esencial has no serious axe violations (${mode})`, async () => {
      const { container } = renderWithQueryClient(themed("azul", mode, "esencial", <BibliotecaEsencial {...esencialProps()} />));
      await settle();
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("cards have names with meta", () => {
    const { container } = renderWithQueryClient(<BibliotecaEsencial {...esencialProps()} />);
    const byName = (name: RegExp) => Array.from(container.querySelectorAll("a")).find((a) => name.test(a.textContent ?? ""))!;
    expect(byName(/^Formatos de obra/).textContent).toBe("Formatos de obra3 documentos · act. 5 nov");
    expect(byName(/^Mis vacaciones/).textContent).toBe("Mis vacaciones12 días disponibles");
    expect(byName(/^RFC/).textContent).toBe("RFC1 documento");
    expect(byName(/^Bitácora de obra/).textContent).toBe("Bitácora de obraFormatos de obrahace 5 min");
    expect(container.querySelectorAll("a > span[aria-hidden='true']")).toHaveLength(11);
    for (const icon of container.querySelectorAll("a svg")) {
      expect(icon.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});

describe("Biblioteca Visual accessibility", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  /** What `BibliotecaIndex` hands the Visual layout for the fixture library. */
  function visualProps(): BibliotecaLayoutProps {
    return {
      links,
      capabilities: resourcesCapabilities(),
      showEmpresa: true,
      showRecursos: true,
      query: "",
      onQueryChange: () => {},
      recents: [
        {
          id: "bitacora",
          title: "Bitácora de obra",
          url: "https://docs.google.com/document/d/docbitacora/edit",
          openedAt: "2026-11-09T17:55:00.000Z",
          section: "formatos-obra",
        },
        {
          id: "manual-2",
          title: "Cómo abrimos un proyecto",
          url: "https://docs.google.com/document/d/docmanual2/edit",
          openedAt: "2026-11-08T15:00:00.000Z",
          section: "empresa",
        },
      ],
      vacations: { balance: { entitled: 20, taken: 6, pending: 2, available: 12 }, requests: [] },
      isPending: false,
      driveEnabled: false,
      now: new Date("2026-11-09T18:00:00.000Z"),
      today: "2026-11-09",
    };
  }

  for (const mode of MODES) {
    it(`Visual has no serious axe violations (${mode})`, async () => {
      const { container } = renderWithQueryClient(themed("azul", mode, "visual", <BibliotecaVisual {...visualProps()} />));
      await settle();
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("carousel region has roledescription and label", () => {
    const { getByRole } = renderWithQueryClient(<BibliotecaVisual {...visualProps()} />);
    const carousel = getByRole("region", { name: "Abiertos recientemente" });
    expect(carousel.getAttribute("aria-roledescription")).toBe("carrusel");
    expect(carousel.querySelector("ul")).not.toBeNull();
    expect(carousel.querySelectorAll("li")).toHaveLength(2);
    for (const img of carousel.querySelectorAll("img")) expect(img.getAttribute("alt")).toBe("");
  });
});

describe("Biblioteca Analítico accessibility", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  /** What `BibliotecaIndex` hands the Analítico layout for the fixture library. */
  function analiticoProps(): BibliotecaLayoutProps {
    return {
      links,
      capabilities: resourcesCapabilities(),
      showEmpresa: true,
      showRecursos: true,
      query: "",
      onQueryChange: () => {},
      recents: [
        {
          id: "bitacora",
          title: "Bitácora de obra",
          url: "https://docs.google.com/document/d/docbitacora/edit",
          openedAt: "2026-11-09T17:55:00.000Z",
          section: "formatos-obra",
        },
      ],
      vacations: null,
      isPending: false,
      driveEnabled: false,
      now: new Date("2026-11-09T18:00:00.000Z"),
      today: "2026-11-09",
    };
  }

  for (const mode of MODES) {
    it(`Analítico has no serious axe violations (${mode})`, async () => {
      const { container } = renderWithQueryClient(themed("azul", mode, "analitico", <BibliotecaAnalitico {...analiticoProps()} />), {
        client: seededBibliotecaClient(null, links),
      });
      await settle();
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("group headers expose aria-expanded", () => {
    const { container } = renderWithQueryClient(<BibliotecaAnalitico {...analiticoProps()} />, {
      client: seededBibliotecaClient(null, links),
    });
    const headers = Array.from(container.querySelectorAll<HTMLButtonElement>("button[aria-controls]"));
    expect(headers.length).toBeGreaterThanOrEqual(5);
    for (const header of headers) {
      expect(["true", "false"]).toContain(header.getAttribute("aria-expanded"));
      const controlled = header.getAttribute("aria-controls")!;
      expect(container.querySelector(`[id="${controlled}"]`)).not.toBeNull();
    }
    for (const th of container.querySelectorAll("th")) expect(th.getAttribute("scope")).toBe("col");
  });
});
