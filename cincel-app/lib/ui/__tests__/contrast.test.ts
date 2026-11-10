import { describe, expect, it } from "vitest";

import type { ThemeId } from "@/lib/types/redesign";
import {
  checkContrast,
  checkContrastBothModes,
  contrastRatio,
  CONTRAST_PAIRS,
  lowContrastMessage,
} from "@/lib/ui/contrast";
import { THEME_PRESETS } from "@/lib/ui/themes";
import { parseColor } from "@/lib/ui/tints";

type Combo = `${ThemeId}-${"light" | "dark"}`;

/** BE §5.5 computed ratios, in `CONTRAST_PAIRS` order. */
const EXPECTED: Record<string, Record<Combo, number>> = {};
const ROWS: [string, number[]][] = [
  ["foreground/background", [16.19, 15.81, 14.66, 14.79, 18.15, 14.49]],
  ["foreground/card", [17.85, 14.0, 15.95, 13.64, 19.8, 13.11]],
  ["muted-foreground/background", [4.63, 7.4, 5.19, 7.03, 4.89, 8.49]],
  ["muted-foreground/card", [5.1, 6.55, 5.65, 6.49, 5.33, 7.69]],
  ["primary-foreground/primary", [5.17, 7.36, 15.18, 6.97, 19.8, 14.49]],
  ["secondary-foreground/secondary", [5.49, 6.91, 5.6, 7.67, 17.68, 11.44]],
  ["destructive/card", [5.08, 6.22, 5.41, 6.91, 5.3, 4.61]],
  ["destructive/background", [4.61, 7.02, 4.97, 7.49, 4.86, 5.09]],
  ["success/card", [5.48, 8.7, 6.14, 8.14, 5.35, 7.17]],
  ["warning-ink/card", [5.02, 10.02, 5.37, 8.92, 5.7, 8.57]],
  ["sidebar-foreground/sidebar", [9.9, 10.78, 8.35, 11.32, 13.36, 13.55]],
  ["sidebar-primary-foreground/sidebar-primary", [5.17, 7.36, 15.95, 6.97, 19.8, 14.49]],
  ["chart-1-ink/chart-1-tint", [5.74, 5.7, 5.99, 6.74, 5.34, 6.15]],
  ["chart-2-ink/chart-2-tint", [6.0, 6.24, 6.56, 7.27, 4.76, 6.14]],
  ["chart-3-ink/chart-3-tint", [4.61, 6.6, 5.67, 7.48, 4.64, 6.89]],
  ["chart-4-ink/chart-4-tint", [4.67, 6.37, 5.72, 7.21, 4.98, 7.62]],
  ["chart-5-ink/chart-5-tint", [4.78, 7.23, 5.23, 7.98, 6.75, 6.17]],
  ["secondary-foreground/tint-primary", [5.49, 5.69, 5.08, 6.76, 13.76, 7.66]],
  ["chart-2-ink/tint-violet", [5.98, 6.26, 6.55, 7.3, 4.76, 6.15]],
  ["warning-ink/tint-warning", [4.51, 6.34, 4.56, 5.86, 4.68, 5.69]],
  ["chart-4-ink/tint-cyan", [4.79, 6.36, 5.71, 7.17, 4.98, 7.65]],
  ["destructive-ink/tint-destructive", [5.37, 6.29, 4.66, 4.85, 4.78, 4.67]],
  ["success/tint-success", [4.84, 5.74, 4.98, 5.51, 4.59, 4.96]],
  ["foreground-soft/card", [10.35, 10.04, 9.92, 9.58, 11.9, 10.17]],
  ["foreground-soft/background", [9.39, 11.34, 9.11, 10.38, 10.91, 11.24]],
  ["foreground-soft/muted", [9.45, 8.89, 8.66, 8.59, 10.17, 9.47]],
  ["chart-1/card", [3.68, 6.58, 3.49, 6.43, 4.42, 4.58]],
  ["chart-2/card", [4.23, 6.15, 4.07, 6.62, 3.2, 4.29]],
  ["chart-3/card", [3.06, 10.02, 3.09, 8.92, 3.08, 4.9]],
  ["chart-4/card", [3.11, 9.26, 4.61, 6.45, 3.07, 5.43]],
  ["chart-5/card", [3.06, 8.7, 3.86, 8.14, 5.77, 5.33]],
  ["border-strong/card", [3.1, 3.07, 3.07, 3.05, 3.07, 3.08]],
  ["ring/background", [4.69, 7.43, 3.21, 6.97, 18.15, 14.49]],
];
const COMBOS: Combo[] = ["azul-light", "azul-dark", "calido-light", "calido-dark", "grafito-light", "grafito-dark"];
for (const [pair, values] of ROWS) {
  EXPECTED[pair] = Object.fromEntries(COMBOS.map((c, i) => [c, values[i]])) as Record<Combo, number>;
}

describe("CONTRAST_PAIRS", () => {
  it("is the one BE §5.5 list plus the Estilos tints: 26 text pairs at 4.5 and 7 non-text pairs at 3", () => {
    expect(CONTRAST_PAIRS.map((p) => p.pair)).toEqual(ROWS.map(([pair]) => pair));
    expect(CONTRAST_PAIRS.filter((p) => p.min === 4.5)).toHaveLength(26);
    expect(CONTRAST_PAIRS.filter((p) => p.min === 3)).toHaveLength(7);
  });
});

describe("checkContrast on the presets", () => {
  for (const combo of COMBOS) {
    const [theme, mode] = combo.split("-") as [ThemeId, "light" | "dark"];
    it(`${combo}: every pair passes and matches the BE §5.5 ratio (±0.01)`, () => {
      const results = checkContrast(THEME_PRESETS[theme].tokens, mode);
      expect(results).toHaveLength(CONTRAST_PAIRS.length);
      for (const result of results) {
        expect(result.mode).toBe(mode);
        expect(result.ok, `${result.pair} ${result.ratio}`).toBe(true);
        expect(result.ratio).toBeGreaterThanOrEqual(result.min);
        expect(Math.abs(result.ratio - EXPECTED[result.pair][combo])).toBeLessThanOrEqual(0.01);
      }
      expect(lowContrastMessage(results)).toBeNull();
    });
  }
});

const TINT_PAIRS = [
  "secondary-foreground/tint-primary",
  "chart-2-ink/tint-violet",
  "warning-ink/tint-warning",
  "chart-4-ink/tint-cyan",
  "destructive-ink/tint-destructive",
  "success/tint-success",
];
const FOREGROUND_SOFT_PAIRS = ["foreground-soft/card", "foreground-soft/background", "foreground-soft/muted"];

describe("Estilos token pairs", () => {
  it("new tint pairs pass in every preset and mode", () => {
    for (const combo of COMBOS) {
      const [theme, mode] = combo.split("-") as [ThemeId, "light" | "dark"];
      const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => TINT_PAIRS.includes(r.pair));
      expect(results.map((r) => r.pair)).toEqual(TINT_PAIRS);
      for (const result of results) {
        expect(result.min).toBe(4.5);
        expect(result.ok, `${combo} ${result.pair} ${result.ratio}`).toBe(true);
      }
    }
  });

  it("foreground-soft passes on card, background and muted", () => {
    for (const combo of COMBOS) {
      const [theme, mode] = combo.split("-") as [ThemeId, "light" | "dark"];
      const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) =>
        FOREGROUND_SOFT_PAIRS.includes(r.pair),
      );
      expect(results.map((r) => r.pair)).toEqual(FOREGROUND_SOFT_PAIRS);
      for (const result of results) expect(result.ok, `${combo} ${result.pair} ${result.ratio}`).toBe(true);
    }
  });
});

describe("checkContrast failures", () => {
  it("muted-foreground #c0c0c0 on white fails and the report names the failing pair", () => {
    const base = THEME_PRESETS.azul.tokens;
    const tokens = {
      ...base,
      "background": { ...base.background, light: "#ffffff" },
      "card": { ...base.card, light: "#ffffff" },
      "muted-foreground": { ...base["muted-foreground"], light: "#c0c0c0" },
    };
    const results = checkContrast(tokens, "light");
    const failing = results.filter((r) => !r.ok);
    expect(failing.map((r) => r.pair)).toEqual(["muted-foreground/background", "muted-foreground/card"]);
    expect(failing[0]).toMatchObject({ mode: "light", min: 4.5, ratio: 1.82 });
    expect(lowContrastMessage(results)).toBe(
      "LOW_CONTRAST: muted-foreground/background light 1.82, muted-foreground/card light 1.82",
    );
    // Dark mode is untouched by the light edit.
    expect(lowContrastMessage(checkContrast(tokens, "dark"))).toBeNull();
  });

  it("reports both modes in one list, light first", () => {
    const base = THEME_PRESETS.grafito.tokens;
    const tokens = { ...base, ring: { light: "#e5e5e5", dark: "#2a2a2a" } };
    expect(lowContrastMessage(checkContrastBothModes(tokens))).toMatch(
      /^LOW_CONTRAST: ring\/background light \d+\.\d{2}, ring\/background dark \d+\.\d{2}$/,
    );
  });

  it("throws INVALID on an unreadable token", () => {
    const base = THEME_PRESETS.azul.tokens;
    expect(() => checkContrast({ ...base, foreground: { ...base.foreground, light: "blue" } }, "light")).toThrow(
      "INVALID: blue",
    );
  });
});

describe("rgba compositing", () => {
  it("composites a translucent foreground over the pair's background", () => {
    const base = THEME_PRESETS.grafito.tokens;
    // 50 % black over white = #808080 (3.95:1 against white).
    const tokens = {
      ...base,
      "background": { ...base.background, light: "#ffffff" },
      "border-strong": { ...base["border-strong"], light: "rgba(0,0,0,0.5)" },
    };
    const result = checkContrast(tokens, "light").find((r) => r.pair === "border-strong/card")!;
    const grey = parseColor("#808080")!;
    const white = parseColor("#ffffff")!;
    expect(result.ratio).toBeCloseTo(contrastRatio(grey, white), 1);
    expect(result.ok).toBe(true);
  });

  it("an opaque-equivalent rgba gives the same ratio as its hex", () => {
    const base = THEME_PRESETS.azul.tokens;
    const hex = checkContrast(base, "light");
    const rgba = checkContrast({ ...base, foreground: { ...base.foreground, light: "rgba(15,23,42,1)" } }, "light");
    expect(rgba).toEqual(hex);
  });

  it("a fully transparent foreground has ratio 1 and fails", () => {
    const base = THEME_PRESETS.azul.tokens;
    const results = checkContrast({ ...base, foreground: { ...base.foreground, light: "#0f172a00" } }, "light");
    const fg = results.find((r) => r.pair === "foreground/card")!;
    expect(fg).toMatchObject({ ratio: 1, ok: false });
  });
});

describe("contrastRatio", () => {
  it("black on white is 21:1 and is symmetric", () => {
    const black = parseColor("#000")!;
    const white = parseColor("#fff")!;
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBe(1);
  });
});
