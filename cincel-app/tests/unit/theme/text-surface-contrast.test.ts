// @vitest-environment node
import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import { compositeOver, requireColor } from "@/lib/ui/tints";

/**
 * The text and surface pairs that settings and widget pages use now that they
 * no longer read the sidebar tokens: muted and normal text on the page, cards
 * and `muted` pills, in every theme and both modes (WCAG AA, 4.5).
 */
const PAIRS = [
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["foreground", "background"],
  ["foreground", "card"],
  ["foreground", "muted"],
  ["secondary-foreground", "secondary"],
] as const;

describe("text on page, card and muted surfaces", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      for (const [fg, bg] of PAIRS) {
        it(`${theme} ${mode}: ${fg} on ${bg} is at least 4.5:1`, () => {
          const tokens = THEME_PRESETS[theme].tokens;
          const page = compositeOver(requireColor(tokens.background[mode]), requireColor(mode === "light" ? "#ffffff" : "#000000"));
          const surface = compositeOver(requireColor(tokens[bg][mode]), page);
          const text = compositeOver(requireColor(tokens[fg][mode]), surface);
          expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

type Tint = { fg: string; bg: string; alpha: { light: number; dark: number } };

/**
 * Text on translucent status tints at 12px: the alphas and ink tokens that
 * `Badge` and the widget pills use (variant -> bg token at alpha, over `card`).
 */
const TINTS: Record<string, Tint> = {
  "destructive badge": { fg: "destructive-ink", bg: "destructive", alpha: { light: 0.1, dark: 0.2 } },
  "destructive pill": { fg: "destructive-ink", bg: "destructive", alpha: { light: 0.14, dark: 0.22 } },
  "success badge": { fg: "success", bg: "success", alpha: { light: 0.1, dark: 0.2 } },
  "warning badge": { fg: "warning-ink", bg: "warning", alpha: { light: 0.07, dark: 0.15 } },
  "warning pill": { fg: "warning-ink", bg: "warning", alpha: { light: 0.07, dark: 0.22 } },
};

describe("text on translucent status tints", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      for (const [name, tint] of Object.entries(TINTS)) {
        it(`${theme} ${mode}: ${name} is at least 4.5:1`, () => {
          const tokens = THEME_PRESETS[theme].tokens as Record<string, { light: string; dark: string }>;
          const page = compositeOver(requireColor(tokens.background[mode]), requireColor(mode === "light" ? "#ffffff" : "#000000"));
          const card = compositeOver(requireColor(tokens.card[mode]), page);
          const base = requireColor(tokens[tint.bg][mode]);
          const surface = compositeOver({ ...base, a: tint.alpha[mode] }, card);
          const text = compositeOver(requireColor(tokens[tint.fg][mode]), surface);
          expect(contrastRatio(text, surface)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }
});

describe("sidebar text and count badges", () => {
  for (const theme of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      const tokens = THEME_PRESETS[theme].tokens;
      const sidebar = compositeOver(
        requireColor(tokens.sidebar[mode]),
        compositeOver(requireColor(tokens.background[mode]), requireColor(mode === "light" ? "#ffffff" : "#000000")),
      );
      it(`${theme} ${mode}: sidebar-foreground at 80% (group label, subtitles) is at least 4.5:1`, () => {
        const fg = requireColor(tokens["sidebar-foreground"][mode]);
        const text = compositeOver({ ...fg, a: 0.8 }, sidebar);
        expect(contrastRatio(text, sidebar)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${theme} ${mode}: count badge text on its sidebar tint is at least 4.5:1`, () => {
        const fg = requireColor(tokens["sidebar-foreground"][mode]);
        const tint = compositeOver({ ...fg, a: 0.15 }, sidebar);
        expect(contrastRatio(compositeOver(fg, tint), tint)).toBeGreaterThanOrEqual(4.5);
      });
      it(`${theme} ${mode}: active count badge on sidebar-primary is at least 4.5:1`, () => {
        const primary = compositeOver(requireColor(tokens["sidebar-primary"][mode]), sidebar);
        const fg = requireColor(tokens["sidebar-primary-foreground"][mode]);
        const tint = compositeOver({ ...fg, a: 0.05 }, primary);
        expect(contrastRatio(compositeOver(fg, tint), tint)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
