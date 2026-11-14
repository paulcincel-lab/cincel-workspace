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
