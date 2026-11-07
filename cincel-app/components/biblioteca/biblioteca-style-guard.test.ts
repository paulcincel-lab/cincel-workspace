// @vitest-environment node
/**
 * FE §18 item 15 for the Biblioteca screens: every style difference lives in
 * the widget library, so neither these components nor their pages import
 * `StyleView` / `useStyle` or branch on the style.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const FILES = [
  "components/biblioteca/BibliotecaIndex.tsx",
  "components/biblioteca/BibliotecaSection.tsx",
  "components/biblioteca/DocumentReader.tsx",
];

function pageFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return name === "vacaciones" ? [] : pageFiles(rel);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [rel] : [];
  });
}

describe("Biblioteca style guard", () => {
  it("renders styles only through components/widgets and components/patterns", () => {
    for (const file of [...FILES, ...pageFiles("app/(staff)/biblioteca")]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect({ file, styleView: /StyleView/.test(source) }).toEqual({ file, styleView: false });
      expect({ file, useStyle: /\buseStyle\b/.test(source) }).toEqual({ file, useStyle: false });
      expect({ file, branch: /["'](esencial|analitico)["']/.test(source) }).toEqual({ file, branch: false });
    }
  });
});
