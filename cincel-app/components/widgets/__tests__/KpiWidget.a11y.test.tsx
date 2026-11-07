// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("@/lib/tramos/compat", () => {
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  const slots: Record<string, number> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { KpiWidget } from "@/components/widgets/KpiWidget";
import { kpiFixture } from "@/components/widgets/fixtures/kpi";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { KpiDatum } from "@/lib/types/widgets";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: value and label inks on
 * `card`, the delta inks (good / bad), the tramo split segments (non-text)
 * and the focus ring.
 */
const KPI_WIDGET_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "success/card",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
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
  const results = await axe.run(document.body);
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderWidget(style: PresentationStyle, items: KpiDatum[], loading = false) {
  return render(
    <StyleProvider style={style} scope="staff">
      <main>
        <h1>Inicio</h1>
        <KpiWidget items={items} loading={loading} />
      </main>
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("KpiWidget a11y", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`${theme} · ${mode} · ${style}: no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, kpiFixture);
          expect(await seriousViolations()).toEqual([]);
        });

        it(`${theme} · ${mode} · ${style}: empty state has no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, []);
          expect(await seriousViolations()).toEqual([]);
        });

        it(`${theme} · ${mode} · ${style}: loading skeleton has no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, kpiFixture, true);
          expect(await seriousViolations()).toEqual([]);
        });
      }

      it(`${theme} · ${mode}: the token pairs the widget uses pass contrast`, () => {
        const used = CONTRAST_PAIRS.filter((p) => KPI_WIDGET_PAIRS.has(p.pair));
        expect(used).toHaveLength(KPI_WIDGET_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => KPI_WIDGET_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }

  it("charts carry role img with the key numbers in their label", () => {
    const { getAllByRole } = renderWidget("visual", kpiFixture);
    const labels = getAllByRole("img").map((n) => n.getAttribute("aria-label") ?? "");
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(labels).toContain("Por tramo: Presale 25 %, Diseño 33 %, Construcción 42 %");
  });
});
