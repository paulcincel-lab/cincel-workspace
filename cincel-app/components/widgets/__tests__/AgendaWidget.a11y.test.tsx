// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/lib/tramos/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { AgendaWidget, type AgendaWidgetProps } from "@/components/widgets/AgendaWidget";
import { agendaEmptyFixture, agendaFixture } from "@/components/widgets/fixtures/agenda";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;
const AGENDA_MODES: AgendaWidgetProps["mode"][] = ["day", "week", "month"];

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: text and meta on `card`,
 * ink on the tramo tints, tramo borders / dots, the today circle, heat cells,
 * grid borders and the focus ring.
 */
const AGENDA_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "primary-foreground/primary",
  "chart-1-ink/chart-1-tint",
  "chart-2-ink/chart-2-tint",
  "chart-3-ink/chart-3-tint",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
  "destructive/card",
  "warning-ink/card",
  "border-strong/card",
  "ring/background",
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
  // Color contrast needs real layout, which happy-dom doesn't provide; the
  // token pairs are checked with checkContrast below.
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderWidget(style: PresentationStyle, mode: AgendaWidgetProps["mode"], items = agendaFixture.items) {
  return render(
    <StyleProvider style={style} scope="staff">
      <main>
        <AgendaWidget title={agendaFixture.title} items={items} mode={mode} anchorDate={agendaFixture.anchorDate} />
      </main>
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("AgendaWidget a11y", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        for (const agendaMode of AGENDA_MODES) {
          it(`${theme} · ${mode} · ${style} · ${agendaMode}: no serious or critical violations`, async () => {
            applyTheme(theme, mode);
            renderWidget(style, agendaMode);
            expect(await seriousViolations()).toEqual([]);
          });
        }

        it(`${theme} · ${mode} · ${style}: empty state has no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, "week", agendaEmptyFixture.items);
          expect(await seriousViolations()).toEqual([]);
        });
      }

      it(`${theme} · ${mode}: the token pairs the agenda uses pass contrast`, () => {
        const used = CONTRAST_PAIRS.filter((p) => AGENDA_PAIRS.has(p.pair));
        expect(used).toHaveLength(AGENDA_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => AGENDA_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }
});
