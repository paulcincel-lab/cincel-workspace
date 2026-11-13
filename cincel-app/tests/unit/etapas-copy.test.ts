import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * #1128: the stages are "etapas" in everything a person can read. This test walks the source
 * (app, components, lib, hooks, scripts/seed-demo.ts) and fails on any string literal, template
 * text or JSX text that still says "tramo"/"tramos" (or builds a `?tramo=` link).
 *
 * Allowed on purpose (compatibility with the old name):
 * - a literal that is exactly the lowercase word "tramo" or "tramos": a key, kind, query key or
 *   segment name (identifiers rename in #1129, the table in #1130);
 * - `lib/assistant/prompt.ts`: the asistente's vocabulary line says it understands "tramo" and answers "etapa";
 * - `next.config.ts`: the permanent redirect of `/ajustes/tramos`;
 * - module specifiers (`@/lib/tramos/...`): file names rename in #1129.
 */
const ROOT = join(__dirname, "..", "..");
const SCAN = ["app", "components", "lib", "hooks"];
const EXTRA_FILES = ["scripts/seed-demo.ts", "proxy.ts", "next.config.ts"];
const ALLOWED_FILES = new Set(["lib/assistant/prompt.ts", "next.config.ts"]);

const WORD = /(?<![\w\-.])tramos?(?![\w\-]|:\$\{)/i;
const LEGACY_PARAM = /(?<![\w])tramo=/;
const IDENTIFIER_ONLY = new Set(["tramo", "tramos", "tramo:"]);

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path) || path.includes("__tests__") || path.includes("/fixtures/") || path.includes("__fixtures__");
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "migrations") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !isTestFile(relative(ROOT, full))) out.push(full);
  }
}

function isModuleSpecifier(node: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return true;
  if (ts.isLiteralTypeNode(parent) && ts.isImportTypeNode(parent.parent)) return true;
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
    const callee = parent.expression;
    return callee.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(callee) && callee.text === "require");
  }
  return false;
}

export function findTramoCopy(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const visit = (node: ts.Node): void => {
    const isText =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node);
    if (isText) {
      let text = ts.isJsxText(node) ? node.getText(sf) : node.text;
      // A template piece followed by `${` is a key prefix (`tramo:${id}`), not prose.
      if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) text += "${";
      if (isModuleSpecifier(node)) {
        // import/export/vi.mock paths
      } else if (!IDENTIFIER_ONLY.has(text.trim()) && (WORD.test(text) || LEGACY_PARAM.test(text))) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push(`${file}:${line + 1} ${text.replace(/\s+/g, " ").trim().slice(0, 100)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("etapas copy (#1128)", () => {
  it("finds user-visible tramo in a sample, and ignores keys and compound identifiers", () => {
    expect(findTramoCopy("a.tsx", 'const a = <p>Sin tramo</p>; const b = "Iniciar tramo"; const c = `/tareas?tramo=${1}`;')).toHaveLength(3);
    expect(findTramoCopy("a.ts", 'const k = "tramo"; const d = "sin-tramo"; const e = "tramoDonut"; const f = "No encontramos esta página";')).toHaveLength(0);
  });

  it("no source string says tramo to the user", { timeout: 120_000 }, () => {
    const files: string[] = [];
    for (const dir of SCAN) walk(join(ROOT, dir), files);
    for (const extra of EXTRA_FILES) files.push(join(ROOT, extra));
    const hits = files
      .filter((file) => !ALLOWED_FILES.has(relative(ROOT, file)))
      .flatMap((file) => findTramoCopy(relative(ROOT, file), readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("the asistente prompt knows tramo as a synonym but answers etapa", () => {
    const prompt = readFileSync(join(ROOT, "lib/assistant/prompt.ts"), "utf8");
    expect(prompt).toContain("«tramo»");
    expect(prompt).toContain("siempre «etapa»");
  });
});
