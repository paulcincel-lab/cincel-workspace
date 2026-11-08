// @vitest-environment happy-dom
import { cleanup } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => nav.params,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/projects-actions", () => ({
  submitProjectCreateAction: vi.fn(),
  updateProjectAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({ getProyectosPageData: vi.fn() }));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({
  fetchCatalogContacts: vi.fn(async () => [{ id: "c1", name: "Familia Gómez", type: "cliente" }]),
  fetchCatalogStaff: vi.fn(async () => [{ id: "s1", name: "Ana López" }]),
  fetchCatalogAssignableStaff: vi.fn(),
  fetchCatalogProjectOptions: vi.fn(),
  fetchCatalogProjectSpaces: vi.fn(),
  fetchCatalogTaskStatuses: vi.fn(),
  fetchCatalogWorkflows: vi.fn(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
vi.mock("@/lib/tramos/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  return {
    canSeeAdminData: () => false,
    listTramos: async () => [],
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

import type { ReactElement } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { PresentationStyle } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

import { ProjectsPortfolio } from "./ProjectsPortfolio";
import { PORTFOLIO, portfolioPageData } from "./projects-portfolio.fixtures";

/** Renders `ui` over a seeded `qk.proyectos.list()` (and admin catalogs), as the page's hydration leaves it. */
function renderSeeded(ui: ReactElement, patch: Partial<ProyectosPageData> = {}) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.list(), portfolioPageData({ portfolio: PORTFOLIO, ...patch }));
  client.setQueryData(qk.catalog.contacts("cliente"), [{ id: "c1", name: "Familia Gómez", type: "cliente" }]);
  client.setQueryData(qk.catalog.staff(), [{ id: "s1", name: "Ana López" }]);
  return renderWithQueryClient(ui, { client });
}

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide;
  // the token pairs are covered by `checkContrast` in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  nav.params = new URLSearchParams();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

function setTheme(theme: string, mode: "light" | "dark") {
  document.documentElement.setAttribute("data-theme-id", theme);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

describe("Proyectos list accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious axe violations in ${theme} / ${mode} for the three styles`, async () => {
        setTheme(theme, mode);
        for (const style of STYLES) {
          const { container, unmount } = renderSeeded(
            <StyleProvider style={style} scope="staff">
              <ProjectsPortfolio />
            </StyleProvider>,
          );
          expect(await seriousViolations(container)).toEqual([]);
          unmount();
        }
      });
    }

    it(`has no serious axe violations in ${theme} for the empty state`, async () => {
      setTheme(theme, "light");
      const { container } = renderSeeded(
        <StyleProvider style="visual" scope="staff">
          <ProjectsPortfolio />
        </StyleProvider>,
        { projects: [], portfolio: [] },
      );
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  for (const mode of MODES) {
    it(`NewProjectDialog (?nuevo=1) has no serious axe violations in ${mode}, admin fields included`, async () => {
      setTheme("azul", mode);
      nav.params = new URLSearchParams("nuevo=1");
      renderSeeded(<ProjectsPortfolio />, { canSeeAdminData: true });
      expect(await seriousViolations(document.body)).toEqual([]);
    });
  }
});
