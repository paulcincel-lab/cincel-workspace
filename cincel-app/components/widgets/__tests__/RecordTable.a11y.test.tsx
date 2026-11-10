// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { CSSProperties, ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { RecordTable, RecordTableSkeleton, type RecordTableProps } from "@/components/widgets/RecordTable";
import {
  recordTableEmptyFixture,
  recordTableFixture,
  recordTableGroupedFixture,
} from "@/components/widgets/fixtures/record-table";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: text and headers on
 * `card`, negative deltas in `destructive`, heat cells as ink on their tint
 * (`destructive-ink` / `warning-ink`).
 */
const RECORD_TABLE_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "destructive-ink/tint-destructive",
  "warning-ink/tint-warning",
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
  "RecordTable, %s %s",
  (theme, mode) => {
    function renderInTheme(style: PresentationStyle, children: ReactNode) {
      document.documentElement.setAttribute("data-theme", mode);
      document.documentElement.classList.toggle("dark", mode === "dark");
      return render(
        <main lang="es" style={themeStyle(theme, mode)}>
          <StyleProvider style={style} scope="staff">
            {children}
          </StyleProvider>
        </main>,
      );
    }

    const full: RecordTableProps = {
      data: recordTableFixture,
      selectable: true,
      rowActions: [{ label: "Ver detalle", onSelect: () => {} }],
    };

    it.each(STYLES)("%s has no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(style, <RecordTable {...full} />);
      expect(await seriousViolations(container)).toEqual([]);
    });

    it.each(STYLES)("%s grouped rows have no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(style, <RecordTable data={recordTableGroupedFixture} />);
      expect(await seriousViolations(container)).toEqual([]);
    });

    it.each(STYLES)("%s empty and loading states have no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(style, <RecordTable data={recordTableEmptyFixture} />);
      expect(await seriousViolations(container)).toEqual([]);
      cleanup();
      const loading = renderInTheme(style, <RecordTableSkeleton />);
      expect(await seriousViolations(loading.container)).toEqual([]);
    });

    it("the token pairs the widget uses meet their contrast minimum", () => {
      const pairs = CONTRAST_PAIRS.filter((p) => RECORD_TABLE_PAIRS.has(p.pair)).map((p) => p.pair);
      expect(pairs.length).toBe(RECORD_TABLE_PAIRS.size);
      const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
        (r) => RECORD_TABLE_PAIRS.has(r.pair) && !r.ok,
      );
      expect(failing).toEqual([]);
    });
  },
);
