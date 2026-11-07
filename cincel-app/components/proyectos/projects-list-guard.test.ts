import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard for the /proyectos list (redesign FE §18 items 12, 15 and 16): the
 * page and its components compose library widgets and patterns only; they
 * never import `StyleView`, never read or branch on the presentation style,
 * never use a font weight above 600, and the dialog extends
 * `ProjectCreateModal` instead of copying it.
 */
const ROOT = join(__dirname, "..", "..");
const FILES = [
  "components/proyectos/ProjectsPortfolio.tsx",
  "components/proyectos/NewProjectDialog.tsx",
  "components/proyectos/projects-portfolio-data.ts",
  "app/(staff)/proyectos/page.tsx",
].map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));

/** Widgets the list composes (FE §4.10.2: `EntityCardGrid` and `DistributionWidget` through these and `ListPage`). */
const ALLOWED_WIDGETS = new Set(["DistributionStripWidget", "EntityCardFooter"]);

describe("Proyectos list composition guard", () => {
  it.each(FILES.map((f) => [f.path, f.text]))("%s does not import StyleView", (_path, text) => {
    expect(text).not.toMatch(/StyleView/);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s does not read or branch on the style", (_path, text) => {
    expect(text).not.toMatch(/\buseStyle\s*\(/);
    expect(text).not.toMatch(/\bstyle\s*[!=]==/);
    expect(text).not.toMatch(/[!=]==\s*["'](visual|esencial|analitico)["']/);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s imports only its library widgets", (_path, text) => {
    const widgets = [...text.matchAll(/from\s+["']@\/components\/widgets\/([A-Za-z]+)["']/g)].map((m) => m[1]);
    for (const widget of widgets) expect(ALLOWED_WIDGETS.has(widget)).toBe(true);
  });

  it.each(FILES.map((f) => [f.path, f.text]))("%s uses no font weight above 600", (_path, text) => {
    expect(text).not.toMatch(/\bfont-(bold|extrabold|black)\b/);
    expect(text).not.toMatch(/fontWeight:\s*[7-9]00/);
  });

  it("renders the list through ListPage cards and the dialog on FormDialog", () => {
    const portfolio = FILES.find((f) => f.path.endsWith("ProjectsPortfolio.tsx"))!.text;
    expect(portfolio).toMatch(/kind: "cards"/);
    expect(portfolio).toMatch(/from "@\/components\/patterns\/ListPage"/);
    const dialog = FILES.find((f) => f.path.endsWith("NewProjectDialog.tsx"))!.text;
    expect(dialog).toMatch(/from "@\/components\/patterns\/FormDialog"/);
    expect(dialog).toMatch(/from "\.\/ProjectCreateModal"/);
    expect(dialog).not.toMatch(/<Input\b/);
  });
});
