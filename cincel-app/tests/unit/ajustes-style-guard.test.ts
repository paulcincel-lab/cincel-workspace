/**
 * Guard (redesign FE §15, §17): Ajustes pages and components render data views
 * only through `components/widgets/*` and `components/patterns/*`; none of them
 * imports `StyleView` or branches on the presentation style.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCANNED = [join(ROOT, "app", "(staff)", "ajustes"), join(ROOT, "components", "ajustes")];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const RULES: { name: string; pattern: RegExp }[] = [
  { name: "imports StyleView", pattern: /\bStyleView\b/ },
  { name: "compares a style value", pattern: /\bstyle\s*[!=]==|[!=]==\s*\w*\.?style\b/ },
  { name: "compares against a style name", pattern: /[!=]==\s*["'](visual|esencial|analitico)["']|["'](visual|esencial|analitico)["']\s*[!=]==/ },
  { name: "branches on useStyle()", pattern: /useStyle\(\)\.style\s*(\?|&&|\|\||[!=]==)/ },
  { name: "switches on the style", pattern: /switch\s*\(\s*[\w.]*style\s*\)/ },
];

describe("Ajustes per-style markup guard", () => {
  const files = SCANNED.flatMap(sourceFiles);

  it("finds the Ajustes sources", () => {
    expect(files.some((f) => f.endsWith("ThemeEditor.tsx"))).toBe(true);
  });

  it("has no StyleView import or style branching in Ajustes pages and components", () => {
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return RULES.filter((rule) => rule.pattern.test(text)).map((rule) => `${relative(ROOT, file)}: ${rule.name}`);
    });
    expect(offenders).toEqual([]);
  });
});
