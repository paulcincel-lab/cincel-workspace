// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { TaskBoardWidget } from "@/components/widgets/TaskBoardWidget";
import { taskBoardFixture, taskBoardTableFixture } from "@/components/widgets/fixtures/task-board";
import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Text color / background pairs the board draws (cards on `card`, overdue
 * dates in `destructive`). Each must be a pair the contrast checker enforces
 * for every theme, so the board is legible wherever the checker passes.
 */
const BOARD_PAIRS = ["foreground/card", "muted-foreground/card", "destructive/card"];

function applyTheme(themeId: string, mode: (typeof MODES)[number]) {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", themeId);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and CSS, which happy-dom doesn't provide;
  // contrast is covered by CONTRAST_PAIRS below and the presets contrast test.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  cleanup();
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("TaskBoardWidget accessibility", () => {
  it("only uses color pairs the contrast checker covers", () => {
    const covered = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of BOARD_PAIRS) expect(covered.has(pair), pair).toBe(true);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious or critical axe violations · ${themeId} ${mode} ${style}`, async () => {
          applyTheme(themeId, mode);
          const { container } = render(
            <StyleProvider style={style} scope="staff">
              <TaskBoardWidget board={taskBoardFixture} table={taskBoardTableFixture} onMove={() => Promise.resolve()} />
            </StyleProvider>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }
});
