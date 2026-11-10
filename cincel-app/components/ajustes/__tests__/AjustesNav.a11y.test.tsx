// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CSSProperties } from "react";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({ usePathname: () => "/ajustes/perfil", useRouter: () => ({ push: vi.fn() }) }));

import { AjustesNav } from "../AjustesNav";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId, TokenName } from "@/lib/types/redesign";

const MODES = ["light", "dark"] as const;

/** The token pairs the nav draws text with (labels, group headings, the outline badge). */
const NAV_PAIRS = ["foreground/background", "muted-foreground/background", "foreground/card", "muted-foreground/card"];

function themeVars(theme: ThemeId, mode: (typeof MODES)[number]): Record<string, string> {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of Object.keys(tokens) as TokenName[]) vars[`--${name}`] = tokens[name][mode];
  return vars;
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
});

describe("AjustesNav accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        const { container } = render(
          <main
            data-theme={mode}
            data-theme-id={theme}
            className={mode === "dark" ? "dark" : undefined}
            style={themeVars(theme, mode) as CSSProperties}
          >
            <AjustesNav active="permisos" isAdmin />
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`passes the shared contrast pairs it uses (${theme}, ${mode})`, () => {
        const pairs = CONTRAST_PAIRS.filter((p) => NAV_PAIRS.includes(p.pair)).map((p) => p.pair);
        expect(pairs.sort()).toEqual([...NAV_PAIRS].sort());
        const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => NAV_PAIRS.includes(r.pair));
        expect(results).toHaveLength(NAV_PAIRS.length);
        expect(results.filter((r) => !r.ok)).toEqual([]);
      });
    }
  }

  it("has no serious or critical axe violations without the Organización group", async () => {
    const { container } = render(
      <main>
        <AjustesNav active="perfil" isAdmin={false} />
      </main>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});
