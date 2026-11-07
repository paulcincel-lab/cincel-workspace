// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
// Custom permission overrides live in localStorage; stub it so the tests use the default matrix.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));
vi.mock("@/lib/tramos/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  return {
    canSeeAdminData: () => true,
    listTramos: async () => [],
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";
import { fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";

import { ProjectSummary } from "./ProjectSummary";
import { ProjectTabs } from "./ProjectTabs";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide;
  // the token pairs are covered by `CONTRAST_PAIRS` / `checkContrast` in lib/ui/contrast.ts.
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
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

function setTheme(theme: string, mode: "light" | "dark") {
  document.documentElement.setAttribute("data-theme-id", theme);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function Page({ style, restricted }: { style: PresentationStyle; restricted: boolean }) {
  const input = fixtureSummaryInput(restricted ? { showBudget: false, showClientContacts: false } : {});
  return (
    <StyleProvider style={style} scope="staff">
      <main>
        <ProjectTabs
          project={{
            id: input.project.id,
            name: input.project.name,
            tramo: input.project.currentWorkflow,
            projectType: input.project.projectType,
            addressCity: input.project.addressCity,
            manager: input.project.manager,
          }}
          active="resumen"
          counts={{ tareas: 39, archivos: 3, clientes: 2 }}
          canManagePortal={!restricted}
          showEstilo
        />
        <ProjectSummary {...input} />
      </main>
    </StyleProvider>
  );
}

describe("Proyecto · Resumen accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious axe violations in ${theme} / ${mode} for the three styles`, async () => {
        setTheme(theme, mode);
        for (const style of STYLES) {
          for (const restricted of [false, true]) {
            const { container, unmount } = render(<Page style={style} restricted={restricted} />);
            expect(await seriousViolations(container)).toEqual([]);
            unmount();
          }
        }
      });
    }
  }
});
