import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard for the /proyectos list (redesign FE §18 items 12, 15 and 16): the
 * page and its components compose library widgets and patterns only; they
 * never import `StyleView`, never read or branch on the presentation style,
 * never use a font weight above 600, and the dialog reuses the shared create
 * form instead of copying it.
 */
const ROOT = join(__dirname, "..", "..");
const FILES = [
  "components/proyectos/ProjectsPortfolio.tsx",
  "components/proyectos/NewProjectDialog.tsx",
  "components/proyectos/projects-portfolio-data.ts",
  "app/(staff)/proyectos/page.tsx",
  "app/(staff)/proyectos/loading.tsx",
].map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));

/** Widgets the list composes (FE §4.10.2: `EntityCardGrid` and `DistributionWidget` through these and `ListPage`). */
const ALLOWED_WIDGETS = new Set([
  "DistributionStripWidget",
  "EntityCardFooter",
  // Estilos kit (#979): the per-style page layout and its shared parts.
  "PageStyleLayout",
  "PageHeader",
  "KpiStrip",
  "FilterCard",
  "GroupedTable",
  "EsencialCard",
  "EsencialItemRow",
  "QuickAddRow",
  // Esencial branch of the list (#993).
  "ProjectsEsencialLayout",
  // Analítico branch of the list (#994).
  "ProjectsAnaliticoLayout",
  // Visual branch of the list (#992).
  "ProjectsVisualLayout",
]);

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
    expect(dialog).toMatch(/from "\.\/project-create-form"/);
    expect(dialog).not.toMatch(/<Input\b/);
  });
});
