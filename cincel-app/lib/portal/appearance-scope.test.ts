import { describe, expect, it } from "vitest";

import {
  parseStoredOrgAppearance,
  PORTAL_APPEARANCE_ATTRIBUTE,
  portalAppearanceCss,
} from "@/lib/portal/appearance-scope";
import { THEME_PRESETS } from "@/lib/ui/themes";

const stored = { ...THEME_PRESETS.calido, redesignDefault: true, v: 3 };

describe("parseStoredOrgAppearance", () => {
  it("reads the v1 envelope stored in app_settings('appearance.theme')", () => {
    expect(parseStoredOrgAppearance(JSON.stringify({ version: 1, data: stored }))).toEqual(stored);
  });

  it("returns null for a missing, malformed, wrong-version or invalid value", () => {
    expect(parseStoredOrgAppearance(null)).toBeNull();
    expect(parseStoredOrgAppearance("{not json")).toBeNull();
    expect(parseStoredOrgAppearance(JSON.stringify({ version: 2, data: stored }))).toBeNull();
    expect(parseStoredOrgAppearance(JSON.stringify({ version: 1, data: { ...stored, baseTheme: "rosa" } }))).toBeNull();
    expect(parseStoredOrgAppearance(JSON.stringify(stored))).toBeNull();
  });
});

describe("portalAppearanceCss", () => {
  it("scopes light values to the portal wrapper and dark values to a dark OS", () => {
    const css = portalAppearanceCss({
      light: { "--background": "#f1f4f9", "--radius": "0.875rem" },
      dark: { "--background": "#0f1115" },
    });

    expect(css).toBe(
      `[${PORTAL_APPEARANCE_ATTRIBUTE}]{color-scheme:light;--background:#f1f4f9;--radius:0.875rem}` +
        `@media (prefers-color-scheme: dark){[${PORTAL_APPEARANCE_ATTRIBUTE}]{color-scheme:dark;--background:#0f1115}}`,
    );
  });

  it("never targets <html>, so a staff theme in the same browser can't reach the portal", () => {
    const css = portalAppearanceCss({ light: { "--primary": "#2563eb" }, dark: { "--primary": "#60a5fa" } });

    expect(css).not.toContain(":root");
    expect(css).not.toContain("html");
  });

  it("drops names and values that could break out of the declaration or the style element", () => {
    const css = portalAppearanceCss({
      light: {
        "--primary": "#2563eb",
        "--evil": "red;}body{display:none",
        "--tag": "</style><script>",
        "not-a-var": "#000",
        "--empty": " ",
      },
      dark: {},
    });

    expect(css).toBe(
      `[${PORTAL_APPEARANCE_ATTRIBUTE}]{color-scheme:light;--primary:#2563eb}` +
        `@media (prefers-color-scheme: dark){[${PORTAL_APPEARANCE_ATTRIBUTE}]{color-scheme:dark}}`,
    );
  });
});
