import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Auth pages are forms: they ignore the presentation style (FE §15.3, §18 item
 * 15), use theme tokens only and stay at or under font weight 600 (§18 item 12).
 */
const FILES = [
  "app/login/page.tsx",
  "app/login/denegado/page.tsx",
  "components/auth/AuthSplitLayout.tsx",
  "components/auth/RedesignLoginForm.tsx",
  "components/auth/use-credentials-login.ts",
];

const read = (file: string) => readFileSync(resolve(__dirname, "../..", file), "utf8");

describe("auth pages guard", () => {
  it.each(FILES)("%s does not import StyleView or branch on the presentation style", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/\bStyleView\b/);
    expect(source).not.toMatch(/\buseStyle\b/);
    expect(source).not.toMatch(/style\s*===/);
  });

  it.each(FILES)("%s uses no font weight above 600", (file) => {
    expect(read(file)).not.toMatch(/\bfont-(bold|extrabold|black)\b/);
  });

  it.each(FILES)("%s uses no raw colors (theme tokens only)", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\(/);
    expect(source).not.toMatch(/\b(?:bg|text|border)-(?:white|black|slate|gray|zinc|neutral|blue|red|rose|green)\b/);
  });
});
