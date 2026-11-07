// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import type { CSSProperties, ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { EntityCardGrid } from "@/components/widgets/EntityCardGrid";
import {
  entityCardEmptyFixture,
  entityCardLibraryFixture,
  entityCardProjectsFixture,
  entityCardProjectsTableFixture,
} from "@/components/widgets/fixtures/entity-card-grid";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: titles, subtitles and
 * meta on `card`, ink on the tramo / icon tints (`chart-1..3`), destructive,
 * success and warning badges, the ring fills, borders and the focus ring.
 */
const ENTITY_GRID_PAIRS = new Set([
  "foreground/card",
  "foreground/background",
  "muted-foreground/card",
  "secondary-foreground/secondary",
  "destructive/card",
  "success/card",
  "warning-ink/card",
  "chart-1-ink/chart-1-tint",
  "chart-2-ink/chart-2-tint",
  "chart-3-ink/chart-3-tint",
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
  "EntityCardGrid, %s %s",
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

    it.each(STYLES)("%s projects grid has no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(
        style,
        <EntityCardGrid
          items={entityCardProjectsFixture}
          footer={(item) => <button type="button">Ver tareas de {item.title}</button>}
        />,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it.each(STYLES)("%s library grid and given table have no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(
        style,
        <>
          <EntityCardGrid items={entityCardLibraryFixture} minWidth={230} />
          <EntityCardGrid items={entityCardProjectsFixture} table={entityCardProjectsTableFixture} />
        </>,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it.each(STYLES)("%s empty and loading states have no serious or critical axe violations", async (style) => {
      const { container } = renderInTheme(
        style,
        <>
          <EntityCardGrid items={entityCardEmptyFixture} emptyState={{ title: "Sin proyectos" }} />
          <EntityCardGrid items={entityCardProjectsFixture} loading />
        </>,
      );
      expect(await seriousViolations(container)).toEqual([]);
    });

    it("the token pairs the widget uses meet their contrast minimum", () => {
      const pairs = CONTRAST_PAIRS.filter((p) => ENTITY_GRID_PAIRS.has(p.pair)).map((p) => p.pair);
      expect(pairs.length).toBe(ENTITY_GRID_PAIRS.size);
      const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
        (r) => ENTITY_GRID_PAIRS.has(r.pair) && !r.ok,
      );
      expect(failing).toEqual([]);
    });
  },
);
