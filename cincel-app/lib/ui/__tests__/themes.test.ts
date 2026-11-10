import { describe, expect, it } from "vitest";

import type { TokenName } from "@/lib/types/redesign";
import { presetFilledTokens, THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";
import { OrgAppearanceSchema, StoredOrgAppearanceSchema } from "@/lib/validation/redesign";

const NEW_TOKENS = [
  "tint-primary",
  "tint-violet",
  "tint-warning",
  "tint-cyan",
  "tint-destructive",
  "tint-success",
  "destructive-ink",
  "foreground-soft",
] as const satisfies readonly TokenName[];

const HEX = /^#[0-9a-f]{6}$/;

describe("theme presets: Estilos tokens", () => {
  it("every preset defines the tint, destructive-ink and foreground-soft tokens", () => {
    for (const name of NEW_TOKENS) expect(TOKEN_NAMES).toContain(name);
    for (const id of THEME_IDS) {
      const tokens = THEME_PRESETS[id].tokens;
      for (const name of NEW_TOKENS) {
        expect(tokens[name], `${id} ${name}`).toBeDefined();
        expect(tokens[name].light, `${id} ${name} light`).toMatch(HEX);
        expect(tokens[name].dark, `${id} ${name} dark`).toMatch(HEX);
      }
    }
  });

  it("azul tint values match the frames", () => {
    const tokens = THEME_PRESETS.azul.tokens;
    expect(tokens["tint-primary"]).toEqual({ light: "#dbeafe", dark: "#29394d" });
    expect(tokens["tint-violet"]).toEqual({ light: "#ede9fe", dark: "#35344d" });
    expect(tokens["tint-warning"]).toEqual({ light: "#fef3c7", dark: "#453e2f" });
    expect(tokens["tint-cyan"]).toEqual({ light: "#cffafe", dark: "#26414b" });
    expect(tokens["tint-destructive"]).toEqual({ light: "#fde8ec", dark: "#473138" });
    expect(tokens["tint-success"]).toEqual({ light: "#d1fae5", dark: "#26413c" });
    expect(tokens["destructive-ink"]).toEqual({ light: "#be123c", dark: "#fda4af" });
    expect(tokens["foreground-soft"]).toEqual({ light: "#334155", dark: "#c3c9d2" });
  });
});

describe("appearances saved before the Estilos tokens", () => {
  const withoutNewTokens = (id: (typeof THEME_IDS)[number]) => {
    const tokens: Partial<Record<TokenName, { light: string; dark: string }>> = { ...THEME_PRESETS[id].tokens };
    for (const name of NEW_TOKENS) delete tokens[name];
    return { ...THEME_PRESETS[id], tokens };
  };

  it("parse and get the missing tokens from their preset", () => {
    const parsed = OrgAppearanceSchema.parse(withoutNewTokens("calido"));
    expect(parsed.tokens).toEqual(THEME_PRESETS.calido.tokens);
    const stored = StoredOrgAppearanceSchema.parse({ ...withoutNewTokens("grafito"), v: 3 });
    expect(stored.v).toBe(3);
    expect(stored.tokens["tint-cyan"]).toEqual(THEME_PRESETS.grafito.tokens["tint-cyan"]);
  });

  it("keep their own values for the tokens they have", () => {
    const own = { ...withoutNewTokens("azul") };
    own.tokens = { ...own.tokens, primary: { light: "#123456", dark: "#abcdef" } };
    const filled = presetFilledTokens("azul", own.tokens);
    expect(filled.primary).toEqual({ light: "#123456", dark: "#abcdef" });
    expect(filled["foreground-soft"]).toEqual(THEME_PRESETS.azul.tokens["foreground-soft"]);
  });

  it("still reject an unreadable new token when one is given", () => {
    const tokens = { ...THEME_PRESETS.azul.tokens, "tint-primary": { light: "blue", dark: "#000000" } };
    const appearance = { ...THEME_PRESETS.azul, tokens };
    expect(OrgAppearanceSchema.safeParse(appearance).success).toBe(false);
  });
});
