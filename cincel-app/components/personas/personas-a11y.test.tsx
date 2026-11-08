// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/auth/auth-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/auth-service")>()),
  getCurrentAuthenticatedUser: () => ({
    access: "Administrador",
    email: "ana@cincel.mx",
    member: { id: "00000000-0000-4000-8000-000000000101" },
  }),
}));
vi.mock("@/lib/actions/staff-actions", () => ({
  fetchStaffDetailAction: vi.fn(),
  saveMemberAction: vi.fn(),
}));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/workspace-access-actions", () => ({ recheckStaffAccessAction: vi.fn() }));
vi.mock("@/lib/tramos/compat", () => ({
  tramoLabel: (key: string) => ({ presale: "Presale", diseno: "Diseño", construccion: "Construcción" })[key] ?? key,
  tramoColorVar: (key: string) =>
    ({ presale: "var(--chart-1)", diseno: "var(--chart-2)", construccion: "var(--chart-3)" })[key] ?? "var(--muted-foreground)",
  tramoColorSlot: (key: string) => ({ presale: 1, diseno: 2, construccion: 3 })[key] ?? null,
  phaseLabel: () => null,
  canSeeAdminData: () => false,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { buildTeamPeople, countPersonasTabs } from "@/lib/personas/team";
import { appearanceStyleBlock, toCssVars } from "@/lib/ui/appearance-css";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
// EquipoView reads the puestos catalog and saves through TanStack Query.
import { renderWithQueryClient as render } from "@/lib/query/test-utils";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

import { EquipoView } from "./EquipoView";
import { EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_STAFF, EQUIPO_TRAMOS } from "./fixtures/equipo";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** Token pairs this page paints text or controls with (subset of `CONTRAST_PAIRS`). */
const PAGE_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "secondary-foreground/secondary",
  "destructive/card",
  "success/card",
  "warning-ink/card",
  "border-strong/card",
  "ring/background",
]);

function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const preset = THEME_PRESETS[theme];
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = appearanceStyleBlock({ light: toCssVars(preset, "light"), dark: toCssVars(preset, "dark") });
  document.head.appendChild(style);
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't
  // provide; token contrast is checked with `checkContrast` instead.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  resetTheme();
});

describe("Personas · Equipo accessibility", () => {
  const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
  const counts = countPersonasTabs(EQUIPO_STAFF, []);

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`token pairs used by the page pass contrast (${theme}, ${mode})`, () => {
        const used = CONTRAST_PAIRS.filter((p) => PAGE_PAIRS.has(p.pair)).map((p) => p.pair);
        expect(used.length).toBe(PAGE_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => PAGE_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });

      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          applyTheme(theme, mode);
          const { container } = render(
            <main>
              <StyleProvider style={style} scope="staff">
                <EquipoView people={people} emails={emails} counts={counts} canCreate />
              </StyleProvider>
            </main>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }

      it(`empty team has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(
          <main>
            <EquipoView people={[]} emails={{}} counts={countPersonasTabs([], [])} canCreate={false} />
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
