// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/biblioteca/vacaciones",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/vacations-actions", () => ({
  decideVacationAction: vi.fn(),
  saveVacationSettingsAction: vi.fn(),
}));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({
  IMPLEMENTED: { decideVacationAction: true, saveVacationSettingsAction: true },
}));
vi.mock("@/components/patterns/FormDialog", async () => ({
  FormDialog: (await import("./vacation-deciders.fixtures")).patternMocks.FormDialog,
}));
vi.mock("@/components/patterns/SettingsSection", async () => ({
  SettingsSection: (await import("./vacation-deciders.fixtures")).patternMocks.SettingsSection,
}));
vi.mock("@/components/patterns/SettingsRow", async () => ({
  SettingsRow: (await import("./vacation-deciders.fixtures")).patternMocks.SettingsRow,
}));
vi.mock("@/components/shell/EmptyState", async () => ({
  EmptyState: (await import("./vacation-deciders.fixtures")).patternMocks.EmptyState,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { appearanceStyleBlock, toCssVars } from "@/lib/ui/appearance-css";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

import { TeamRequests } from "./TeamRequests";
import { VacationSettings } from "./VacationSettings";
import { pendingRequestsFixture, vacationSettingsFixture, VIEWER_ID } from "./vacation-deciders.fixtures";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** Token pairs these sections paint text or controls with (subset of `CONTRAST_PAIRS`). */
const SECTION_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "destructive/background",
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

function renderSections(style: PresentationStyle) {
  return render(
    <main>
      <StyleProvider style={style} scope="staff">
        <TeamRequests requests={pendingRequestsFixture()} viewerStaffId={VIEWER_ID} canDecide />
        <VacationSettings initial={vacationSettingsFixture()} canDecide />
      </StyleProvider>
    </main>,
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
});

describe("Solicitudes del equipo and Días de vacaciones accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`token pairs used by the sections pass contrast (${theme}, ${mode})`, () => {
        const used = CONTRAST_PAIRS.filter((p) => SECTION_PAIRS.has(p.pair)).map((p) => p.pair);
        expect(used.length).toBe(SECTION_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => SECTION_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });

      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          applyTheme(theme, mode);
          const { container } = renderSections(style);
          expect(await seriousViolations(container)).toEqual([]);
        });
      }

      it(`the decide dialog has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = renderSections("visual");
        fireEvent.click(screen.getByRole("button", { name: "Rechazar solicitud de Ana Torres" }));
        expect(screen.getByRole("dialog")).toBeTruthy();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
