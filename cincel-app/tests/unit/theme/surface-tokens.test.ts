// @vitest-environment node
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");

/** Body of the first `{ ... }` block (no nested braces) opening at or after `from`. */
function blockBodyAt(from: number): string {
  const open = css.indexOf("{", from);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function token(body: string, name: string): string {
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim().toLowerCase() : "";
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = blockBodyAt(css.search(/^:root\s*\{/m));
const darkExplicit = blockBodyAt(css.search(/^\.dark,\s*\n:root\[data-theme="dark"\]/m));
const darkMedia = blockBodyAt(
  css.indexOf(":root", css.indexOf("@media (prefers-color-scheme: dark)")),
);

describe("surface tokens", () => {
  it("light mode: gray page, white cards and popovers, 1px border", () => {
    expect(token(light, "background")).toBe("#f5f5f4");
    expect(token(light, "card")).toBe("#ffffff");
    expect(token(light, "popover")).toBe("#ffffff");
    expect(token(light, "border")).toBe("#e5e5e5");
  });

  it.each([
    ["explicit dark", darkExplicit],
    ["prefers-color-scheme dark", darkMedia],
  ])("%s: card stays a step lighter than the page", (_label, body) => {
    const bg = token(body, "background");
    const card = token(body, "card");
    expect(luminance(card)).toBeGreaterThan(luminance(bg));
    expect(token(body, "popover")).toBe(card);
  });

  it("dark blocks stay in sync", () => {
    for (const name of ["background", "card", "popover", "border"]) {
      expect(token(darkMedia, name)).toBe(token(darkExplicit, name));
    }
  });

  it.each([
    ["light", light],
    ["dark", darkExplicit],
  ])("%s: text on page and card surfaces is at least 4.5:1", (_label, body) => {
    const pairs: [string, string][] = [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["card-foreground", "card"],
      ["muted-foreground", "card"],
      ["popover-foreground", "popover"],
    ];
    for (const [fg, bg] of pairs) {
      expect(contrast(token(body, fg), token(body, bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
