// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { CronogramaWidget } from "@/components/widgets/CronogramaWidget";
import { CRONOGRAMA_PROJECT_ID, cronogramaEmptyTable, cronogramaTable } from "@/components/widgets/fixtures/cronograma";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** Token pairs the widget paints text and marks with. */
const USED_PAIRS = ["foreground/card", "muted-foreground/card", "destructive/card", "border-strong/card"];

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // it is checked through `checkContrast` below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

describe("CronogramaWidget accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          document.documentElement.setAttribute("data-theme", mode);
          document.documentElement.setAttribute("data-theme-id", theme);
          document.documentElement.classList.toggle("dark", mode === "dark");
          const { container } = render(
            <StyleProvider style={style} scope="staff">
              <CronogramaWidget projectId={CRONOGRAMA_PROJECT_ID} table={cronogramaTable} />
            </StyleProvider>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }

  it("has no serious or critical axe violations in the empty and loading states", async () => {
    for (const style of STYLES) {
      const empty = render(
        <StyleProvider style={style} scope="staff">
          <CronogramaWidget projectId={CRONOGRAMA_PROJECT_ID} table={cronogramaEmptyTable} />
        </StyleProvider>,
      );
      expect(await seriousViolations(empty.container)).toEqual([]);
      empty.unmount();

      const loading = render(
        <StyleProvider style={style} scope="staff">
          <CronogramaWidget projectId={CRONOGRAMA_PROJECT_ID} table={cronogramaTable} loading />
        </StyleProvider>,
      );
      expect(await seriousViolations(loading.container)).toEqual([]);
      loading.unmount();
    }
  });

  it("hides the decorative timeline bars and keeps every value as text", () => {
    const { container } = render(
      <StyleProvider style="visual" scope="staff">
        <CronogramaWidget projectId={CRONOGRAMA_PROJECT_ID} table={cronogramaTable} />
      </StyleProvider>,
    );
    for (const bar of container.querySelectorAll("li > div[aria-hidden]")) {
      expect(bar.textContent).toBe("");
    }
  });

  it("the token pairs it uses pass contrast in every theme, light and dark", () => {
    const known = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of USED_PAIRS) expect(known.has(pair), pair).toBe(true);
    for (const theme of THEME_IDS) {
      for (const mode of MODES) {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => USED_PAIRS.includes(r.pair) && !r.ok,
        );
        expect(failing, `${theme} ${mode}`).toEqual([]);
      }
    }
  });
});
