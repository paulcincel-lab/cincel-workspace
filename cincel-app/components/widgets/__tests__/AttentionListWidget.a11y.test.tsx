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
    phaseLabel: () => null,
    listTramos: async () => [],
    canSeeAdminData: () => false,
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { AttentionListWidget } from "@/components/widgets/AttentionListWidget";
import {
  attentionListEmptyFixture,
  attentionListFixture,
  type AttentionListFixture,
} from "@/components/widgets/fixtures/attention-list";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/**
 * Token pairs of `CONTRAST_PAIRS` the widget paints: titles and meta on `card`,
 * late dates and the critical pill (`destructive`), the warn pill
 * (`warning-ink`), the ok pill (`success`), the default pill (`secondary`),
 * avatar initials (`primary`), tramo bars and dots (`chart-N` on `card`).
 */
const ATTENTION_PAIRS = new Set([
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "warning-ink/card",
  "success/card",
  "secondary-foreground/secondary",
  "primary-foreground/primary",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
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

function renderWidget(style: PresentationStyle, fixture: AttentionListFixture, loading = false) {
  return render(
    <StyleProvider style={style} scope="staff">
      <main>
        <AttentionListWidget
          title={fixture.title}
          items={fixture.items}
          totalCount={fixture.totalCount}
          moreHref={fixture.items.length > 0 ? fixture.moreHref : undefined}
          loading={loading}
        />
      </main>
    </StyleProvider>,
  );
}

afterEach(() => {
  cleanup();
  resetTheme();
  document.body.innerHTML = "";
});

describe("AttentionListWidget a11y", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`${theme} · ${mode} · ${style}: no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, attentionListFixture);
          expect(await seriousViolations()).toEqual([]);
        });

        it(`${theme} · ${mode} · ${style}: empty state has no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, attentionListEmptyFixture);
          expect(await seriousViolations()).toEqual([]);
        });

        it(`${theme} · ${mode} · ${style}: loading skeleton has no serious or critical violations`, async () => {
          applyTheme(theme, mode);
          renderWidget(style, attentionListFixture, true);
          expect(await seriousViolations()).toEqual([]);
        });
      }

      it(`${theme} · ${mode}: the token pairs the widget uses pass contrast`, () => {
        const used = CONTRAST_PAIRS.filter((p) => ATTENTION_PAIRS.has(p.pair));
        expect(used).toHaveLength(ATTENTION_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => ATTENTION_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }
});
