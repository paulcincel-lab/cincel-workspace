import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard for the Inicio page (redesign FE §18 items 12 and 15): the page and
 * its components compose library widgets only; they never import `StyleView`,
 * never read or branch on the presentation style and never use a font weight
 * above 600.
 */
const ROOT = join(__dirname, "..", "..");
const DIRS = [join(ROOT, "components", "inicio"), join(ROOT, "app", "(staff)", "inicio")];

/** The widgets Inicio composes (FE §4.10.2); `LineSeriesWidget` is the library's `WidgetCard` + `chart.tsx` line. */
const ALLOWED_WIDGETS = new Set([
  "KpiWidget",
  "DistributionWidget",
  "WidgetCard",
  "LineSeriesWidget",
  "AttentionListWidget",
  "AgendaWidget",
  "ProgressListWidget",
  "PeopleWidget",
  // The page column: Esencial's 980 px max content width (FE §15.2), decided inside the library.
  "StyleContent",
  // Estilos kit (#979): the per-style page layout and its shared parts.
  "PageStyleLayout",
  "PageHeader",
  "KpiStrip",
  "FilterCard",
  "GroupedTable",
  "EsencialCard",
  "EsencialItemRow",
  "QuickAddRow",
  // Visual hover and focus lift class shared by the kit cards (#985).
  "lift",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const FILES = DIRS.flatMap(sourceFiles).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

describe("Inicio composition guard", () => {
  it("finds the Inicio sources", () => {
    expect(FILES.some((f) => f.path.endsWith("InicioClient.tsx"))).toBe(true);
    expect(FILES.some((f) => f.path.endsWith("page.tsx"))).toBe(true);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s does not import StyleView", (_path, text) => {
    expect(text).not.toMatch(/StyleView/);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s does not read or branch on the style", (_path, text) => {
    expect(text).not.toMatch(/\buseStyle\s*\(/);
    expect(text).not.toMatch(/\bstyle\s*[!=]==/);
    expect(text).not.toMatch(/[!=]==\s*["'](visual|esencial|analitico)["']/);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s imports only the Inicio library widgets", (_path, text) => {
    const widgets = [...text.matchAll(/from\s+["']@\/components\/widgets\/([A-Za-z]+)["']/g)].map((m) => m[1]);
    for (const widget of widgets) expect(ALLOWED_WIDGETS.has(widget)).toBe(true);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s uses no font weight above 600", (_path, text) => {
    expect(text).not.toMatch(/\bfont-(bold|extrabold|black)\b/);
    expect(text).not.toMatch(/fontWeight:\s*[7-9]00/);
  });
});
