// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import PortalAppearance from "./PortalAppearance";
import PortalLoginForm from "./PortalLoginForm";
import PortalNotFoundView from "./PortalNotFoundView";
import PortalShell from "./PortalShell";
import type { ResolvedAppearance, ThemeId } from "@/lib/types/redesign";
import { checkContrast, CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

const MODES = ["light", "dark"] as const;

/** Token pairs these two pages draw text and controls with. */
const PAIRS_USED = [
  "foreground/background",
  "foreground/card",
  "muted-foreground/card",
  "primary-foreground/primary",
  "destructive/card",
  "ring/background",
];

function orgAppearance(theme: ThemeId): ResolvedAppearance {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars = (mode: "light" | "dark") =>
    Object.fromEntries(Object.entries(tokens).map(([name, value]) => [`--${name}`, value[mode]]));
  return {
    theme,
    mode: "system",
    style: THEME_PRESETS[theme].styleDefault,
    density: "comoda",
    textSize: 14,
    redesignEnabled: true,
    cssVars: { light: vars("light"), dark: vars("dark") },
    version: 1,
  };
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide; checkContrast covers it below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function setMode(mode: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe("portal login and 404 accessibility in the organization theme", () => {
  it("checks every pair it relies on through the shared contrast list", () => {
    const listed = new Set(CONTRAST_PAIRS.map((pair) => pair.pair));
    for (const pair of PAIRS_USED) expect(listed.has(pair)).toBe(true);
  });

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      describe(`${theme} · ${mode}`, () => {
        it("the theme's text and control pairs pass contrast", () => {
          const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
            (result) => PAIRS_USED.includes(result.pair) && !result.ok,
          );
          expect(failing).toEqual([]);
        });

        it("PortalLogin has no serious or critical axe violations", async () => {
          setMode(mode);
          const { container } = render(
            <PortalAppearance appearance={orgAppearance(theme)}>
              <PortalShell clientName={null}>
                <PortalLoginForm linkError redesign />
              </PortalShell>
            </PortalAppearance>,
          );

          expect(container.querySelector(`[data-portal-appearance][data-theme-id="${theme}"]`)).toBeTruthy();
          expect(await seriousViolations(container)).toEqual([]);
        });

        it("Portal404 has no serious or critical axe violations", async () => {
          setMode(mode);
          const { container } = render(
            <PortalAppearance appearance={orgAppearance(theme)}>
              <PortalShell clientName="Ana López">
                <PortalNotFoundView redesign />
              </PortalShell>
            </PortalAppearance>,
          );

          expect(await seriousViolations(container)).toEqual([]);
        });
      });
    }
  }
});

describe("portal login and 404 sources", () => {
  const sources = ["PortalLoginForm.tsx", "PortalNotFoundView.tsx", "PortalAppearance.tsx"].map((file) =>
    readFileSync(resolve(__dirname, file), "utf8"),
  );

  it("ignore the presentation style (no StyleView, no style branching)", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/StyleView|useStyle|style ===/);
    }
  });

  it("use no font weight above 600 and no literal colors", () => {
    for (const source of sources) {
      expect(source).not.toMatch(/font-(bold|extrabold|black)\b/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});
