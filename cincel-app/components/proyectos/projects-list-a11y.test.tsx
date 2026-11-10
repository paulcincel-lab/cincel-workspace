// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
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
  setProjectCurrentTramoAction: vi.fn(),
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
import { useProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";
import type { PresentationStyle } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

import { ProjectsPortfolio } from "./ProjectsPortfolio";
import { ProjectsEsencialLayout } from "@/components/widgets/ProjectsEsencialLayout";
import { ProjectsVisualLayout } from "@/components/widgets/ProjectsVisualLayout";
import { ProjectsAnaliticoLayout } from "@/components/widgets/ProjectsAnaliticoLayout";
import { THEME_PRESETS } from "@/lib/ui/themes";
import { contrastRatio } from "@/lib/ui/contrast";
import { TINT_PERCENT, compositeOver, mixOklab, requireColor } from "@/lib/ui/tints";
import type { TokenName } from "@/lib/types/redesign";
import { PORTFOLIO, PROJECTS, portfolioPageData } from "./projects-portfolio.fixtures";

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
    it(`segment toggles and the collapse button are axe clean in ${mode} for the three styles`, async () => {
      setTheme("azul", mode);
      for (const style of STYLES) {
        // A selected tramo (pressed toggle).
        useProyectosDashboard.getState().selectKpi("diseno");
        const expanded = renderSeeded(
          <StyleProvider style={style} scope="staff">
            <ProjectsPortfolio />
          </StyleProvider>,
        );
        expect(await seriousViolations(expanded.container)).toEqual([]);
        expanded.unmount();

        // The collapsed strip: only its title and the expand button remain.
        useProyectosDashboard.getState().setCollapsed("tramoStrip", true);
        const collapsed = renderSeeded(
          <StyleProvider style={style} scope="staff">
            <ProjectsPortfolio />
          </StyleProvider>,
        );
        expect(await seriousViolations(collapsed.container)).toEqual([]);
        collapsed.unmount();
        useProyectosDashboard.getState().reset();
      }
    });

    it(`NewProjectDialog (?nuevo=1) has no serious axe violations in ${mode}, admin fields included`, async () => {
      setTheme("azul", mode);
      nav.params = new URLSearchParams("nuevo=1");
      renderSeeded(<ProjectsPortfolio />, { canSeeAdminData: true });
      expect(await seriousViolations(document.body)).toEqual([]);
    });
  }
});

describe("Proyectos list accessibility · Esencial (#993)", () => {
  function renderEsencial(patch: Partial<ProyectosPageData> = {}) {
    return renderSeeded(
      <StyleProvider style="esencial" scope="staff">
        <ProjectsEsencialLayout />
      </StyleProvider>,
      patch,
    );
  }

  for (const mode of MODES) {
    it(`Esencial has no serious or critical axe violations (${mode})`, async () => {
      setTheme("azul", mode);
      const listed = renderEsencial();
      expect(await seriousViolations(listed.container)).toEqual([]);
      listed.unmount();

      // A selected pill, a project without tramo and the no-results state.
      useProyectosDashboard.getState().selectKpi("diseno");
      const selected = renderEsencial({
        projects: [...PROJECTS, { ...PROJECTS[2], id: "p-sin", name: "Bodega Norte", status: "activo" }],
      });
      expect(await seriousViolations(selected.container)).toEqual([]);
      fireEvent.change(screen.getByLabelText("Buscar proyectos"), { target: { value: "zzz" } });
      expect(await seriousViolations(selected.container)).toEqual([]);
      selected.unmount();
      useProyectosDashboard.getState().reset();

      const empty = renderEsencial({ projects: [], portfolio: [] });
      expect(await seriousViolations(empty.container)).toEqual([]);
      empty.unmount();
    });
  }

  it("pill group is a labelled radiogroup", () => {
    renderEsencial();
    const group = screen.getByRole("radiogroup", { name: "Filtrar por tramo" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(1);
    // One tab stop: the checked pill ("Todos" with no selection).
    expect(radios.filter((r) => r.getAttribute("tabindex") === "0")).toEqual([radios[0]]);
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
  });

  it("filter result is announced", () => {
    const { container } = renderEsencial();
    const live = container.querySelector('[aria-live="polite"][data-slot="projects-esencial-count"]');
    expect(live?.textContent).toBe("2 proyectos");
    fireEvent.click(screen.getByRole("radio", { name: /Diseño/ }));
    expect(live?.textContent).toBe("1 proyecto");
    // The reset re-renders the mounted list, so it runs inside act.
    act(() => useProyectosDashboard.getState().reset());
  });
});

describe("Proyectos list accessibility · Analítico (#994)", () => {
  function renderAnalitico(patch: Partial<ProyectosPageData> = {}) {
    return renderSeeded(
      <StyleProvider style="analitico" scope="staff">
        <ProjectsAnaliticoLayout />
      </StyleProvider>,
      patch,
    );
  }

  for (const mode of MODES) {
    it(`Analítico has no serious or critical axe violations (${mode})`, async () => {
      setTheme("azul", mode);
      const admin = renderAnalitico({ canSeeAdminData: true, portfolio: PORTFOLIO });
      expect(await seriousViolations(admin.container)).toEqual([]);
      admin.unmount();

      // Filters with a pressed tramo, then the no-match state.
      nav.params = new URLSearchParams("tramo=diseno&mostrar=vencidas&pausados=1");
      const filtered = renderAnalitico();
      expect(await seriousViolations(filtered.container)).toEqual([]);
      fireEvent.change(screen.getByLabelText("Buscar proyectos"), { target: { value: "zzz" } });
      expect(await seriousViolations(filtered.container)).toEqual([]);
      filtered.unmount();
      nav.params = new URLSearchParams();

      const empty = renderAnalitico({ projects: [], portfolio: [] });
      expect(await seriousViolations(empty.container)).toEqual([]);
      empty.unmount();
    });
  }

  it("table has caption and scoped headers", () => {
    const { container } = renderAnalitico();
    const tables = [...container.querySelectorAll("table")];
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const caption = table.querySelector("caption");
      const label = table.getAttribute("aria-label") ?? table.getAttribute("aria-labelledby");
      expect(Boolean(caption?.textContent?.trim()) || Boolean(label)).toBe(true);
      const headers = [...table.querySelectorAll("thead th")];
      expect(headers.length).toBeGreaterThan(0);
      for (const th of headers) expect(th.getAttribute("scope")).toBe("col");
    }
    // The tramo nav and the anchors.
    const tramoNav = screen.getByRole("navigation", { name: "Ir a tramo" });
    expect(within(tramoNav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#t-presale", "#t-diseno"]);
  });

  /** The heat fills (status tint over the card) under their text (status ink). */
  const HEAT_PAIRS: { fg: string; tint: TokenName }[] = [
    { fg: "warning-ink", tint: "warning" },
    { fg: "destructive-ink", tint: "destructive" },
  ];

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      it(`heat cells keep 4.5:1 contrast (${themeId}, ${mode})`, () => {
        const tokens = THEME_PRESETS[themeId].tokens as Record<string, { light: string; dark: string } | undefined>;
        const canvas = requireColor(mode === "light" ? "#ffffff" : "#000000");
        const page = compositeOver(requireColor(tokens.background![mode]), canvas);
        const card = compositeOver(requireColor(tokens.card![mode]), page);
        for (const { fg, tint } of HEAT_PAIRS) {
          // Heat cells paint `bg-tint-<tone>`: the theme's tint token, else the tone mixed into the card.
          const tintToken = tokens[`tint-${tint}`];
          const bg = tintToken
            ? compositeOver(requireColor(tintToken[mode]), card)
            : compositeOver(mixOklab(requireColor(tokens[tint]![mode]), card, TINT_PERCENT[mode]), card);
          // `destructive-ink` falls back to `destructive` where a theme has no ink of its own.
          const ink = tokens[fg] ?? tokens[tint]!;
          const ratio = contrastRatio(compositeOver(requireColor(ink[mode]), bg), bg);
          expect(ratio, `${fg} on ${tint} tint`).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

describe("Proyectos list accessibility · Visual (#992)", () => {
  function renderVisual(patch: Partial<ProyectosPageData> = {}) {
    return renderSeeded(
      <StyleProvider style="visual" scope="staff">
        <ProjectsVisualLayout />
      </StyleProvider>,
      patch,
    );
  }

  for (const mode of MODES) {
    it(`Visual has no serious or critical axe violations (${mode})`, async () => {
      setTheme("azul", mode);
      const listed = renderVisual();
      expect(await seriousViolations(listed.container)).toEqual([]);
      listed.unmount();

      // A selected tramo with no project, a project without tramo, and no drag permission.
      useProyectosDashboard.getState().selectKpi("construccion");
      const selected = renderVisual({
        projects: [...PROJECTS, { ...PROJECTS[2], id: "p-sin", name: "Bodega Norte", status: "activo" }],
        canChangeProjectStage: false,
      });
      expect(await seriousViolations(selected.container)).toEqual([]);
      selected.unmount();
      useProyectosDashboard.getState().reset();

      const empty = renderVisual({ projects: [], portfolio: [] });
      expect(await seriousViolations(empty.container)).toEqual([]);
      empty.unmount();
    });
  }

  it("rings and bars expose role img with labels", () => {
    const { container } = renderVisual();
    // Casa Lomas: real 62 % (attention ring and board bar); Diseño's average bar.
    expect(screen.getAllByRole("img", { name: "Avance 62 %" }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("img", { name: "Avance medio 62 %" })).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Tramo actual: Diseño" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /^Equipo: Ana López, Luis Paz/ })).toBeTruthy();
    for (const img of container.querySelectorAll('[role="img"]')) expect(img.getAttribute("aria-label")).toBeTruthy();
  });

  it("board cards are reachable by Tab in reading order", () => {
    const { container } = renderVisual();
    const board = container.querySelector<HTMLElement>('[data-slot="portfolio-board"]')!;
    const cards = [...board.querySelectorAll<HTMLAnchorElement>('[data-slot="board-card"]')];
    // Column order (Presale, Diseño, Construcción), then card order: plain links, none taken out of the tab order.
    expect(cards.map((c) => c.dataset.project)).toEqual(["p-andares", "p-lomas"]);
    for (const card of cards) {
      expect(card.tagName).toBe("A");
      expect(card.getAttribute("tabindex")).toBeNull();
    }
    // No positive tabindex reorders the board (Base UI buttons carry an explicit tabindex="0").
    expect(board.querySelectorAll("[tabindex]:not([tabindex='-1']):not([tabindex='0'])")).toHaveLength(0);
  });
});
