import { describe, expect, it } from "vitest";

import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import {
  applyPreset,
  contrastResults,
  failingRows,
  formatRatio,
  matchesPreset,
  textPairs,
  TOKEN_SECTIONS,
  TYPE_ROLE_LABELS,
} from "@/lib/ui/theme-editor";
import { themeCss } from "@/lib/ui/theme-export";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES, TYPE_SCALE_DEFAULT } from "@/lib/ui/themes";

describe("theme editor model", () => {
  it("shows every token exactly once across the sections", () => {
    const shown = TOKEN_SECTIONS.flatMap((s) => s.tokens.map((t) => t.name));
    expect([...shown].sort()).toEqual([...TOKEN_NAMES].sort());
    expect(TOKEN_SECTIONS.map((s) => s.title)).toEqual(["Interfaz", "Navegación", "Tramos y estatus"]);
  });

  it("labels every type role", () => {
    expect(TYPE_ROLE_LABELS.map((r) => r.role).sort()).toEqual(Object.keys(TYPE_SCALE_DEFAULT).sort());
  });

  it.each(THEME_IDS)("preset %s has no failing row in either mode", (id) => {
    const results = contrastResults(THEME_PRESETS[id].tokens);
    expect(failingRows(results.light).size).toBe(0);
    expect(failingRows(results.dark).size).toBe(0);
  });

  it("marks both tokens of a failing pair", () => {
    const tokens = {
      ...THEME_PRESETS.azul.tokens,
      "muted-foreground": { ...THEME_PRESETS.azul.tokens["muted-foreground"], light: "#c0c0c0" },
    };
    const rows = failingRows(contrastResults(tokens).light);
    expect(rows.get("muted-foreground")).toContain("--muted-foreground / --card");
    expect(rows.has("card")).toBe(true);
    expect(rows.has("primary")).toBe(false);
  });

  it("marks the chart color, not a tint, for a failing ink pair", () => {
    const tokens = {
      ...THEME_PRESETS.azul.tokens,
      "chart-2-ink": { ...THEME_PRESETS.azul.tokens["chart-2-ink"], light: "#ffffff" },
    };
    const rows = failingRows(contrastResults(tokens).light);
    expect(rows.has("chart-2-ink")).toBe(true);
    expect(rows.has("chart-2")).toBe(true);
  });

  it("applies a preset while keeping the organization style settings", () => {
    const draft = { ...THEME_PRESETS.azul, styleDefault: "analitico" as const, allowUserOverride: false };
    const next = applyPreset(draft, THEME_PRESETS.grafito);
    expect(next.tokens).toEqual(THEME_PRESETS.grafito.tokens);
    expect(next.baseTheme).toBe("grafito");
    expect(next.styleDefault).toBe("analitico");
    expect(next.allowUserOverride).toBe(false);
    expect(matchesPreset(next, THEME_PRESETS, "grafito")).toBe(true);
    expect(matchesPreset(next, THEME_PRESETS, "azul")).toBe(false);
  });

  it("lists one resolved color pair per text pair", () => {
    const pairs = textPairs(THEME_PRESETS.calido.tokens, "dark");
    expect(pairs).toHaveLength(CONTRAST_PAIRS.filter((p) => p.min === 4.5).length);
    expect(pairs[0]).toEqual({
      fg: THEME_PRESETS.calido.tokens.foreground.dark,
      bg: THEME_PRESETS.calido.tokens.background.dark,
      label: "--foreground / --background",
    });
    expect(pairs.every((p) => p.bg.length > 0)).toBe(true);
  });

  it("rounds ratios down to one decimal", () => {
    expect(formatRatio(4.4999)).toBe("4.4");
    expect(formatRatio(4.5)).toBe("4.5");
    expect(formatRatio(16.27)).toBe("16.2");
  });
});

describe("themeCss", () => {
  it("exports the light values in :root and the dark values in .dark", () => {
    const css = themeCss(THEME_PRESETS.azul);
    const [root, dark] = css.split(".dark {");
    expect(root.startsWith(":root {")).toBe(true);
    expect(root).toContain(`--background: ${THEME_PRESETS.azul.tokens.background.light};`);
    expect(dark).toContain(`--background: ${THEME_PRESETS.azul.tokens.background.dark};`);
    expect(root).toContain("--radius:");
    expect(root).toContain("--font-sans:");
  });
});
