// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { CSSProperties, ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { ProgressListWidget } from "@/components/widgets/ProgressListWidget";
import { progressListEmptyFixture, progressListFixture } from "@/components/widgets/fixtures/progress-list";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: labels, sublabels and
 * desviación on `card`, the bar / ring fills (`chart-N`), borders, focus ring.
 */
const PROGRESS_PAIRS = new Set([
  "foreground/card",
  "foreground/background",
  "muted-foreground/card",
  "destructive/card",
  "success/card",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
  "border-strong/card",
  "ring/background",
]);

function themeStyle(theme: ThemeId, mode: (typeof MODES)[number]): CSSProperties {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = tokens[name][mode];
  return vars as CSSProperties;
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // the token pairs are checked with checkContrast below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

describe.each(THEME_IDS.flatMap((theme) => MODES.map((mode) => [theme, mode] as const)))(
  "ProgressListWidget, %s %s",
  (theme, mode) => {
    function renderInTheme(style: PresentationStyle, node: ReactNode) {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
      return render(
        <main lang="es" style={themeStyle(theme, mode)}>
          <StyleProvider style={style} scope="staff">
            {node}
          </StyleProvider>
        </main>,
      );
    }

    it.each(STYLES)("%s has no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(
        style,
        <ProgressListWidget title={progressListFixture.title} items={progressListFixture.items} />,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it("Visual rings have no serious or critical axe violations", async () => {
      const { container } = renderInTheme(
        "visual",
        <ProgressListWidget title={progressListFixture.title} items={progressListFixture.items} variant="rings" />,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it.each(STYLES)("%s empty and loading states have no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(
        style,
        <>
          <ProgressListWidget title="Avance vacío" items={progressListEmptyFixture.items} />
          <ProgressListWidget title="Avance cargando" items={progressListFixture.items} loading />
        </>,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it("the token pairs the widget uses meet their contrast minimum", () => {
      const pairs = CONTRAST_PAIRS.filter((p) => PROGRESS_PAIRS.has(p.pair)).map((p) => p.pair);
      expect(pairs.length).toBe(PROGRESS_PAIRS.size);
      const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
        (r) => PROGRESS_PAIRS.has(r.pair) && !r.ok,
      );
      expect(failing).toEqual([]);
    });
  },
);
