import { describe, expect, it } from "vitest";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { composite, contrastRatio, mixOklab, parseColor } from "@/lib/ui/color";
import { chartTintCss, mixTint } from "@/lib/ui/tints";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

describe("checkContrast (BE §5.5)", () => {
  it("passes every pair for every preset in light and dark", () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        const results = checkContrast(THEME_PRESETS[theme].tokens, mode);
        expect(results).toHaveLength(CONTRAST_PAIRS.length);
        for (const r of results) expect(r.ok, `${theme} ${mode} ${r.pair} ${r.ratio}`).toBe(true);
      }
    }
  });

  it("matches the computed ratios of the §5.5 table", () => {
    const ratio = (theme: (typeof THEME_IDS)[number], mode: "light" | "dark", pair: string) =>
      checkContrast(THEME_PRESETS[theme].tokens, mode).find((r) => r.pair === pair)?.ratio;
    expect(ratio("azul", "light", "foreground/background")).toBeCloseTo(16.19, 2);
    expect(ratio("azul", "light", "chart-3-ink/chart-3-tint")).toBeCloseTo(4.61, 2);
    expect(ratio("azul", "dark", "border-strong/card")).toBeCloseTo(3.07, 2);
    expect(ratio("calido", "light", "primary-foreground/primary")).toBeCloseTo(15.18, 2);
    expect(ratio("grafito", "dark", "destructive/card")).toBeCloseTo(4.61, 2);
  });

  it("fails a muted-foreground #c0c0c0 edit on white with the right pair", () => {
    const tokens = THEME_PRESETS.azul.tokens;
    const edited = { ...tokens, "muted-foreground": { ...tokens["muted-foreground"], light: "#c0c0c0" } };
    const failing = checkContrast(edited, "light").filter((r) => !r.ok).map((r) => r.pair);
    expect(failing).toEqual(["muted-foreground/background", "muted-foreground/card"]);
  });
});

describe("color math", () => {
  it("composites rgba over the background", () => {
    const c = composite(parseColor("rgba(255,255,255,0.5)"), parseColor("#000000"));
    expect(Math.round(c.r)).toBe(128);
    expect(contrastRatio(parseColor("#000"), parseColor("#fff"))).toBeCloseTo(21, 5);
  });

  it("mixes in oklab like CSS color-mix", () => {
    expect(mixOklab("#ff0000", "#ff0000", 0.3)).toBe("#ff0000");
    expect(mixOklab("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(mixTint("#000000", "#ffffff", "light")).toBe(mixOklab("#000000", "#ffffff", 0.14));
    expect(chartTintCss(2, "dark")).toBe("color-mix(in oklab, var(--chart-2) 22%, var(--card))");
  });
});

describe("sidebar avatar initials (Ajustes › Apariencia axe)", () => {
  it("keeps secondary-foreground on tint-primary above 4.5 in every theme, light and dark", () => {
    for (const theme of THEME_IDS) {
      for (const mode of ["light", "dark"] as const) {
        const r = checkContrast(THEME_PRESETS[theme].tokens, mode).find((x) => x.pair === "secondary-foreground/tint-primary");
        expect(r, `${theme} ${mode}`).toBeDefined();
        expect(r!.ratio, `${theme} ${mode}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
