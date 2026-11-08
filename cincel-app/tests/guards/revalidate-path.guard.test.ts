// @vitest-environment node
/**
 * revalidatePath lives in the per-screen helpers (#935, plan §2e, §4.4).
 * Outside lib/cache/screens only `revalidatePath("/", "layout")` may stay
 * inline (the theme, general settings, time-tracking settings, own staff name,
 * auth and, until its phase, the photo). The correo tool's call is the one
 * other exception: Phase 10 deletes it.
 *
 * Calls are found with the TypeScript parser, so comments and strings that
 * mention revalidatePath never count, and multi-line calls still do.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const SCAN_FILES = ["proxy.ts", "instrumentation.ts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__snapshots__", "fixtures"]);
const SOURCE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

const SCREEN_HELPERS_DIR = "lib/cache/screens/";
/** Inline calls that stay as they are until a later phase removes them. */
const ALLOWED_FILES = new Set(["lib/assistant/tools/correo.ts"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(path, out);
    } else if (SOURCE.test(name) && !TEST_FILE.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function sourceFiles(): string[] {
  const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
  for (const name of SCAN_FILES) {
    try {
      if (statSync(join(ROOT, name)).isFile()) files.push(join(ROOT, name));
    } catch {
      // not present in this checkout
    }
  }
  return files;
}

function stringValue(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

/** Every `revalidatePath(...)` call in `text` that is not `("/", "layout")`, as "line: call". */
function disallowedCalls(file: string, text: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined;
      if (name === "revalidatePath") {
        const isLayoutRoot = stringValue(node.arguments[0]) === "/" && stringValue(node.arguments[1]) === "layout";
        if (!isLayoutRoot || node.arguments.length !== 2) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          found.push(`${line}: ${node.getText(source).replace(/\s+/g, " ")}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("revalidatePath stays in lib/cache/screens", () => {
  it("the parser check catches what it should", () => {
    const text = [
      "// revalidatePath('/tareas') in a comment",
      'const s = "revalidatePath(\\"/x\\")";',
      'revalidatePath("/", "layout");',
      "revalidatePath('/', 'layout');",
      'revalidatePath("/tareas");',
      'revalidatePath(\n  "/mi-espacio",\n  "layout",\n);',
      "next.revalidatePath(`/proyectos/${id}`);",
    ].join("\n");
    expect(disallowedCalls("lib/actions/x.ts", text)).toEqual([
      '5: revalidatePath("/tareas")',
      '6: revalidatePath( "/mi-espacio", "layout", )',
      "10: next.revalidatePath(`/proyectos/${id}`)",
    ]);
  });

  it("no call outside the helpers but ('/', 'layout')", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = relative(ROOT, file).split(sep).join("/");
      if (rel.startsWith(SCREEN_HELPERS_DIR) || ALLOWED_FILES.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("revalidatePath")) continue;
      for (const call of disallowedCalls(rel, text)) offenders.push(`${rel}:${call}`);
    }
    expect(offenders).toEqual([]);
  });
});
