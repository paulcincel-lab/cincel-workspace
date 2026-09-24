import { describe, expect, it } from "vitest";

import {
  darkModeToken,
  isPrimaryColorToken,
  primaryColorCss,
  primaryColorValue,
  readableForeground,
} from "./primary-color";

describe("primary color", () => {
  it("accepts only palette tokens", () => {
    expect(isPrimaryColorToken("red-600")).toBe(true);
    expect(isPrimaryColorToken("neutral-950")).toBe(true);
    expect(isPrimaryColorToken("red-650")).toBe(false);
    expect(isPrimaryColorToken("black")).toBe(false);
    expect(isPrimaryColorToken("#ff0000")).toBe(false);
    expect(isPrimaryColorToken(null)).toBe(false);
  });

  it("resolves a token to Tailwind's color", () => {
    expect(primaryColorValue("red-500")).toBe("oklch(63.7% 0.237 25.331)");
  });

  it("picks white text on dark colors and near-black on light ones", () => {
    expect(readableForeground(primaryColorValue("blue-700"))).toBe("#ffffff");
    expect(readableForeground(primaryColorValue("neutral-950"))).toBe("#ffffff");
    expect(readableForeground(primaryColorValue("amber-300"))).toBe("#0a0a0a");
    expect(readableForeground(primaryColorValue("sky-100"))).toBe("#0a0a0a");
  });

  it("mirrors the shade for dark mode", () => {
    expect(darkModeToken("red-600")).toBe("red-400");
    expect(darkModeToken("zinc-950")).toBe("zinc-50");
    expect(darkModeToken("teal-500")).toBe("teal-500");
  });

  it("emits overrides for light and dark, and nothing without a token", () => {
    expect(primaryColorCss(null)).toBe("");
    const css = primaryColorCss("blue-700");
    expect(css).toContain(`html:root{--primary:${primaryColorValue("blue-700")};--primary-foreground:#ffffff`);
    expect(css).toContain(`html:root[data-theme="dark"]{--primary:${primaryColorValue("blue-300")}`);
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });
});
