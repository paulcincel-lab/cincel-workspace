// @vitest-environment node
/** Appearance resolver and cookie (redesign BE §8.1, §8.2, §9.2). */
import { describe, expect, it } from "vitest";

import type { OrgAppearance, UserPreferences } from "@/lib/types/redesign";
import { toCssVars } from "@/lib/ui/appearance-css";
import { parseAppearanceCookie } from "@/lib/ui/appearance-cookie";
import {
  APPEARANCE_COOKIE,
  APPEARANCE_COOKIE_OPTIONS,
  appearanceCookieValue,
  DEFAULT_USER_PREFERENCES,
  resolveAppearance,
  serializeAppearanceCookie,
} from "@/lib/ui/preferences";
import { THEME_PRESETS } from "@/lib/ui/themes";

const EDITED_PRIMARY = { light: "#123456", dark: "#654321" };

/** Org on Azul with one edited token, so "org tokens vs preset" is observable. */
function org(overrides: Partial<OrgAppearance> = {}, v = 5): OrgAppearance & { v: number } {
  return {
    ...THEME_PRESETS.azul,
    tokens: { ...THEME_PRESETS.azul.tokens, primary: EDITED_PRIMARY },
    ...overrides,
    v,
  };
}

function user(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return { ...DEFAULT_USER_PREFERENCES, ...overrides };
}

describe("resolveAppearance", () => {
  it("without a user: org theme, org style and the defaults", () => {
    const resolved = resolveAppearance(org(), null);
    expect(resolved).toMatchObject({
      theme: "azul",
      style: "visual",
      mode: "light",
      density: "comoda",
      textSize: 14,
      version: 5,
    });
  });

  it("override on: the user's theme and style apply", () => {
    const resolved = resolveAppearance(org(), user({ theme: "calido", style: "analitico" }));
    expect(resolved.theme).toBe("calido");
    expect(resolved.style).toBe("analitico");
  });

  it("override off: the user's theme and style are ignored", () => {
    const resolved = resolveAppearance(org({ allowUserOverride: false }), user({ theme: "calido", style: "esencial" }));
    expect(resolved.theme).toBe("azul");
    expect(resolved.style).toBe("visual");
    expect(resolved.cssVars.light["--primary"]).toBe(EDITED_PRIMARY.light);
  });

  it("null user theme / style follow the org", () => {
    const resolved = resolveAppearance(org({ styleDefault: "esencial" }), user({ theme: null, style: null }));
    expect(resolved.theme).toBe("azul");
    expect(resolved.style).toBe("esencial");
  });

  it("the base theme uses the org tokens (with its edits)", () => {
    const resolved = resolveAppearance(org(), user({ theme: "azul" }));
    expect(resolved.cssVars.light["--primary"]).toBe(EDITED_PRIMARY.light);
    expect(resolved.cssVars.dark["--primary"]).toBe(EDITED_PRIMARY.dark);
  });

  it("another theme uses its preset, never the org's edits of another base", () => {
    const resolved = resolveAppearance(org(), user({ theme: "grafito" }));
    expect(resolved.cssVars.light).toEqual(
      toCssVars({ ...org(), baseTheme: "grafito", tokens: THEME_PRESETS.grafito.tokens }, "light", 14),
    );
    expect(resolved.cssVars.light["--primary"]).toBe(THEME_PRESETS.grafito.tokens.primary.light);
    expect(resolved.cssVars.dark["--primary"]).toBe(THEME_PRESETS.grafito.tokens.primary.dark);
  });

  it("a new user starts in light mode, whatever the OS prefers", () => {
    expect(DEFAULT_USER_PREFERENCES.mode).toBe("light");
    expect(resolveAppearance(org(), null).mode).toBe("light");
    expect(resolveAppearance(org(), user()).mode).toBe("light");
  });

  it("a saved mode is kept, Sistema included", () => {
    for (const mode of ["light", "dark", "system"] as const) {
      expect(resolveAppearance(org(), user({ mode })).mode).toBe(mode);
    }
  });

  it("mode, density and text size come from the user", () => {
    const resolved = resolveAppearance(org(), user({ mode: "dark", density: "compacta", textSize: 15.5 }));
    expect(resolved).toMatchObject({ mode: "dark", density: "compacta", textSize: 15.5 });
    expect(resolved.cssVars.light["--text-base"]).toBe("15.5px");
    expect(resolved.cssVars.dark["--text-base"]).toBe("15.5px");
  });

  it("cssVars carry both modes and the version is the org v (1 when absent)", () => {
    const resolved = resolveAppearance(org(), null);
    expect(resolved.cssVars.light["--background"]).toBe(THEME_PRESETS.azul.tokens.background.light);
    expect(resolved.cssVars.dark["--background"]).toBe(THEME_PRESETS.azul.tokens.background.dark);
    expect(resolveAppearance(THEME_PRESETS.azul, null).version).toBe(1);
  });
});

describe("appearance cookie", () => {
  const resolved = resolveAppearance(org(), user({ theme: "calido", mode: "dark", textSize: 13.5 }));

  it("is named cincel-appearance, readable by the client, Lax, one year", () => {
    expect(APPEARANCE_COOKIE).toBe("cincel-appearance");
    expect(APPEARANCE_COOKIE_OPTIONS).toEqual({
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  });

  it("holds { theme, mode, style, density, textSize, v }", () => {
    expect(appearanceCookieValue(resolved)).toEqual({
      theme: "calido",
      mode: "dark",
      style: "visual",
      density: "comoda",
      textSize: 13.5,
      v: 5,
    });
    expect(JSON.parse(serializeAppearanceCookie(resolved))).toEqual(appearanceCookieValue(resolved));
  });

  it("round-trips while the version matches", () => {
    expect(parseAppearanceCookie(serializeAppearanceCookie(resolved), 5)).toEqual(appearanceCookieValue(resolved));
    expect(parseAppearanceCookie(encodeURIComponent(serializeAppearanceCookie(resolved)), 5)).toEqual(
      appearanceCookieValue(resolved),
    );
  });

  it("is ignored when its v differs from the current version", () => {
    expect(parseAppearanceCookie(serializeAppearanceCookie(resolved), 6)).toBeNull();
    expect(parseAppearanceCookie(serializeAppearanceCookie(resolved), 4)).toBeNull();
  });

  it("is ignored when missing, malformed or carrying invalid values", () => {
    expect(parseAppearanceCookie(undefined, 5)).toBeNull();
    expect(parseAppearanceCookie("", 5)).toBeNull();
    expect(parseAppearanceCookie("{not json", 5)).toBeNull();
    const valid = appearanceCookieValue(resolved);
    expect(parseAppearanceCookie(JSON.stringify({ ...valid, theme: "rosa" }), 5)).toBeNull();
    expect(parseAppearanceCookie(JSON.stringify({ ...valid, textSize: 20 }), 5)).toBeNull();
    expect(parseAppearanceCookie(JSON.stringify({ ...valid, extra: true }), 5)).toBeNull();
  });
});
