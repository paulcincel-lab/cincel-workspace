// @vitest-environment node
/** Appearance → CSS variables (redesign BE §8.2, FE §14.1). */
import { describe, expect, it } from "vitest";

import type { OrgAppearance, TokenName } from "@/lib/types/redesign";
import {
  appearanceStyleBlock,
  CARD_SHADOWS,
  FONT_FAMILY_VARIABLES,
  toCssVars,
  TYPE_ROLES,
} from "@/lib/ui/appearance-css";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";

/** Every `TokenName` of BE §6, spelled out so a missing preset entry fails here. */
const ALL_TOKENS: TokenName[] = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "warning", "warning-ink", "success",
  "border", "border-strong", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "chart-1-ink", "chart-2-ink", "chart-3-ink", "chart-4-ink", "chart-5-ink",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];

describe("toCssVars", () => {
  it("TOKEN_NAMES covers every TokenName", () => {
    expect([...TOKEN_NAMES].sort()).toEqual([...ALL_TOKENS].sort());
  });

  for (const id of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`emits every token for ${id} ${mode}`, () => {
        const vars = toCssVars(THEME_PRESETS[id], mode);
        for (const name of ALL_TOKENS) {
          expect(vars[`--${name}`], name).toBe(THEME_PRESETS[id].tokens[name][mode]);
        }
      });
    }
  }

  it("emits the type scale for the six roles", () => {
    const vars = toCssVars(THEME_PRESETS.azul, "light");
    expect(TYPE_ROLES).toEqual(["pageTitle", "sectionTitle", "cardTitle", "body", "label", "kpi"]);
    expect(vars["--type-pageTitle-size"]).toBe("22px");
    expect(vars["--type-pageTitle-weight"]).toBe("600");
    expect(vars["--type-sectionTitle-size"]).toBe("16px");
    expect(vars["--type-cardTitle-size"]).toBe("14px");
    expect(vars["--type-cardTitle-weight"]).toBe("500");
    expect(vars["--type-body-size"]).toBe("14px");
    expect(vars["--type-body-weight"]).toBe("400");
    expect(vars["--type-label-size"]).toBe("12px");
    expect(vars["--type-kpi-size"]).toBe("28px");
    expect(vars["--type-kpi-weight"]).toBe("500");
  });

  it("emits the shape: radius in rem, padding and gap in px, card shadow", () => {
    const azul = toCssVars(THEME_PRESETS.azul, "light");
    expect(azul["--radius"]).toBe("0.875rem");
    expect(azul["--card-padding"]).toBe("20px");
    expect(azul["--gap"]).toBe("16px");
    expect(azul["--shadow-card"]).toBe(CARD_SHADOWS.suave);
    expect(CARD_SHADOWS.suave).toBe("0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.04)");

    expect(toCssVars(THEME_PRESETS.grafito, "dark")["--shadow-card"]).toBe("none");

    const custom: OrgAppearance = {
      ...THEME_PRESETS.azul,
      shape: { radius: 0, cardPadding: 12, gap: 8, shadow: "marcada" },
    };
    const vars = toCssVars(custom, "dark");
    expect(vars["--radius"]).toBe("0rem");
    expect(vars["--card-padding"]).toBe("12px");
    expect(vars["--gap"]).toBe("8px");
    expect(vars["--shadow-card"]).toBe("0 10px 30px rgba(15,23,42,0.12)");
  });

  it("points --font-sans at the selected family", () => {
    expect(toCssVars(THEME_PRESETS.azul, "light")["--font-sans"]).toContain(`var(${FONT_FAMILY_VARIABLES.Geist})`);
    const inter = toCssVars({ ...THEME_PRESETS.azul, fontFamily: "Inter" }, "light");
    expect(inter["--font-sans"]).toContain("var(--font-inter)");
    const dm = toCssVars({ ...THEME_PRESETS.azul, fontFamily: "DM Sans" }, "light");
    expect(dm["--font-sans"]).toContain("var(--font-dm-sans)");
  });

  it("--text-base is the text size, else the org body size", () => {
    expect(toCssVars(THEME_PRESETS.azul, "light", 15.5)["--text-base"]).toBe("15.5px");
    expect(toCssVars(THEME_PRESETS.azul, "dark", 13)["--text-base"]).toBe("13px");
    expect(toCssVars(THEME_PRESETS.azul, "light")["--text-base"]).toBe("14px");
  });

  it("uses org token edits", () => {
    const org: OrgAppearance = {
      ...THEME_PRESETS.azul,
      tokens: { ...THEME_PRESETS.azul.tokens, primary: { light: "#123456", dark: "#abcdef" } },
    };
    expect(toCssVars(org, "light")["--primary"]).toBe("#123456");
    expect(toCssVars(org, "dark")["--primary"]).toBe("#abcdef");
  });
});

describe("appearanceStyleBlock", () => {
  it("renders one html:root[data-theme] rule per mode", () => {
    const css = appearanceStyleBlock({
      light: toCssVars(THEME_PRESETS.azul, "light"),
      dark: toCssVars(THEME_PRESETS.azul, "dark"),
    });
    expect(css.startsWith('html:root[data-theme="light"]{')).toBe(true);
    expect(css).toContain('}html:root[data-theme="dark"]{');
    expect(css).toContain("--background:#f1f4f9");
    expect(css).toContain("--background:#0f1115");
    expect(css.match(/html:root\[data-theme=/g)).toHaveLength(2);
  });

  it("drops declarations that could break out of the rule or the style element", () => {
    const css = appearanceStyleBlock({
      light: { "--ok": "#fff", "--bad": "red}</style><script>", "bad name": "#000", "--semi": "a;b" },
      dark: {},
    });
    expect(css).toBe('html:root[data-theme="light"]{--ok:#fff}html:root[data-theme="dark"]{}');
  });
});
