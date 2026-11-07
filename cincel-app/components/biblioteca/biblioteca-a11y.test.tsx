// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { documentToc, empresaDoc, empresaDocLinks } from "@/lib/biblioteca/catalog";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

import { bibliotecaFixture } from "./biblioteca.fixtures";
import { BibliotecaIndex } from "./BibliotecaIndex";
import { BibliotecaSection } from "./BibliotecaSection";
import { DocumentReader } from "./DocumentReader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/biblioteca",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/resources-actions", () => ({
  createResourceLinkAction: vi.fn(),
  deleteResourceLinkAction: vi.fn(),
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

const SCREENS: { name: string; node: () => ReactNode }[] = [
  { name: "index", node: () => <BibliotecaIndex links={links} /> },
  {
    name: "sección",
    node: () => <BibliotecaSection section="formatos-obra" links={links} viewerId="staff-ana" canManageFavorites driveEnabled />,
  },
  {
    name: "documento",
    node: () => (
      <DocumentReader
        doc={parts[0]}
        toc={documentToc(parts, manual)}
        companyDoc={{ slug: manual.slug, title: manual.title, description: manual.description }}
        driveEnabled
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
            const { container, unmount } = render(themed(theme, mode, style, screen.node()));
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
