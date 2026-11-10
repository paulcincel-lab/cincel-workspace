// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { CSSProperties, ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { DistributionWidget, type DistributionWidgetProps } from "@/components/widgets/DistributionWidget";
import { distributionEmptyFixture, distributionFixture } from "@/components/widgets/fixtures/distribution";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";
import { settle } from "@/tests/helpers/settle";

// happy-dom has no layout, so ResponsiveContainer measures 0×0 and renders
// nothing. Pass children straight through so the donut is part of the scan.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: labels and numbers on
 * `card`, the donut segments (`chart-1..4`, non-text 3:1) on `card`.
 */
const DISTRIBUTION_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
  "chart-4/card",
]);

function themeStyle(theme: ThemeId, mode: (typeof MODES)[number]): CSSProperties {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of TOKEN_NAMES) vars[`--${name}`] = tokens[name][mode];
  return vars as CSSProperties;
}

async function seriousViolations(container: HTMLElement) {
  // Let the lazy donut replace its placeholder so axe audits the settled widget.
  await settle();
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
  "DistributionWidget, %s %s",
  (theme, mode) => {
    function renderInTheme(style: PresentationStyle, props: DistributionWidgetProps) {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
      return render(
        <main lang="es" style={themeStyle(theme, mode)}>
          <StyleProvider style={style} scope="staff">
            <DistributionWidget {...props} />
          </StyleProvider>
        </main>,
      );
    }

    it.each(STYLES)("%s has no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(style, distributionFixture);
      if (style === "visual") {
        const chart = container.querySelector('[role="img"]');
        expect(chart?.getAttribute("aria-label")).toBeTruthy();
      }
      expect(await seriousViolations(container)).toEqual([]);
    });

    it.each(STYLES)("%s empty and loading states have no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(style, distributionEmptyFixture);
      expect(await seriousViolations(container)).toEqual([]);
      cleanup();
      const loading = renderInTheme(style, { ...distributionFixture, loading: true });
      expect(await seriousViolations(loading.container)).toEqual([]);
    });

    it("the token pairs the widget uses meet their contrast minimum", () => {
      const pairs = CONTRAST_PAIRS.filter((p) => DISTRIBUTION_PAIRS.has(p.pair)).map((p) => p.pair);
      expect(pairs.length).toBe(DISTRIBUTION_PAIRS.size);
      const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
        (r) => DISTRIBUTION_PAIRS.has(r.pair) && !r.ok,
      );
      expect(failing).toEqual([]);
    });
  },
);
