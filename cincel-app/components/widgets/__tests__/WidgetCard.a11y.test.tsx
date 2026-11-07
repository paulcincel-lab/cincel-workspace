// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { Activity } from "lucide-react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { widgetCardEmptyFixture, widgetCardFixture, type WidgetCardFixture } from "@/components/widgets/fixtures/widget-card";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** Token pairs of `CONTRAST_PAIRS` the card paints: title, body and tone inks on `card`, borders. */
const WIDGET_CARD_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "success/card",
  "warning-ink/card",
  "border-strong/card",
]);

function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars = Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value[mode]};`)
    .join("");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
  document.head.appendChild(style);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.setAttribute("data-theme-id", theme);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
}

async function seriousViolations() {
  const results = await axe.run(document.body);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderCard(style: PresentationStyle, fixture: WidgetCardFixture, empty = false) {
  return render(
    <StyleProvider style={style} scope="staff">
      <main>
        <WidgetCard
          title={fixture.title}
          icon={Activity}
          tone={fixture.tone}
          actions={<a href={fixture.moreHref}>Ver todo</a>}
          emptyState={empty ? { title: "Sin datos esta semana" } : undefined}
        >
          {fixture.items.length > 0 ? (
            <ul>
              {fixture.items.map((item) => (
                <li key={item.key}>
                  {item.label} {item.display ?? item.value}
                </li>
              ))}
            </ul>
          ) : null}
        </WidgetCard>
      </main>
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("WidgetCard a11y", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`${theme} · ${mode} · ${style}: no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderCard(style, widgetCardFixture);
          expect(await seriousViolations()).toEqual([]);
        });

        it(`${theme} · ${mode} · ${style}: empty state has no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderCard(style, widgetCardEmptyFixture, true);
          expect(await seriousViolations()).toEqual([]);
        });
      }

      it(`${theme} · ${mode}: the token pairs the card uses pass contrast`, () => {
        const used = CONTRAST_PAIRS.filter((p) => WIDGET_CARD_PAIRS.has(p.pair));
        expect(used).toHaveLength(WIDGET_CARD_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => WIDGET_CARD_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }
});
