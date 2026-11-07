// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";

import { AssistantCardMessage } from "../AssistantCardMessage";
import { AssistantChartMessage } from "../AssistantChartMessage";
import { AssistantListMessage } from "../AssistantListMessage";
import { AssistantStatGridMessage } from "../AssistantStatGridMessage";
import {
  CARD,
  CHART_BAR,
  CHART_LINE,
  LIST,
  MODES,
  STAT_GRID,
  STYLES,
  THEME_IDS,
  applyTheme,
  renderInStyle,
  resetTheme,
} from "./fixtures";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are covered by `CONTRAST_PAIRS` / `checkContrast` in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const WIDGETS: [string, () => ReactNode][] = [
  ["render_chart bar", () => <AssistantChartMessage {...CHART_BAR} />],
  ["render_chart line", () => <AssistantChartMessage {...CHART_LINE} />],
  ["render_card", () => <AssistantCardMessage {...CARD} />],
  ["render_stat_grid", () => <AssistantStatGridMessage {...STAT_GRID} />],
  ["render_list", () => <AssistantListMessage {...LIST} />],
];

afterEach(() => {
  cleanup();
  resetTheme();
});

describe.each(THEME_IDS)("assistant widgets a11y, theme %s", (theme) => {
  describe.each(MODES)("%s", (mode) => {
    it.each(STYLES)("has no serious or critical axe violations in the %s style", async (style) => {
      applyTheme(theme, mode);
      for (const [, widget] of WIDGETS) {
        const { container, unmount } = renderInStyle(style, widget());
        expect(await seriousViolations(container)).toEqual([]);
        unmount();
      }
    });
  });
});
