#!/usr/bin/env node
/**
 * Guard for the Query Migration's "switch fully" rule (plan §5.0).
 *
 *   node scripts/check-data-patterns.mjs <files…>
 *
 * Prints `file:line pattern` for every old data pattern left in the given
 * files and exits 1 when there is one (0 when clean, 2 on bad usage). It
 * parses each file with the TypeScript compiler, so multi-line effects and
 * calls split over several lines are caught and comments are ignored.
 *
 * Patterns:
 * - `router.refresh(`
 * - `setInterval(` whose callback loads data
 * - `revalidatePath(` (allowed: `lib/cache/screens/*`, and `('/', 'layout')`
 *   in the keep-list files: org theme, general settings, time-tracking
 *   settings, own staff name and auth)
 * - `useEffect` / `useLayoutEffect` / `startTransition` bodies that call an
 *   imported `*Action`, `fetch(` or a `load*` / `reload` / `refetch` helper
 * - `useState(initial…)` / `useState(props.…)` copies of server props
 * - `window.dispatchEvent(new (Custom)?Event("cincel:…"))`, also through a
 *   same-file string constant
 *
 * A reported line ending in `// data-patterns: auth` is allowed (auth flows only).
 */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const APP_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Files whose `revalidatePath('/', 'layout')` stays (plan §4.4). */
export const LAYOUT_KEEP_LIST = new Set([
  "lib/actions/org-appearance-actions.ts",
  "lib/actions/app-settings-actions.ts",
  "lib/actions/time-tracking-actions.ts",
  "lib/actions/staff-actions.ts",
  "lib/auth/auth-actions.ts",
]);

const SCREEN_HELPERS_DIR = "lib/cache/screens/";
const ALLOW_COMMENT = /\/\/\s*data-patterns:\s*auth\s*$/;
const EFFECT_HOOKS = new Set(["useEffect", "useLayoutEffect", "startTransition"]);
const LOADER_NAME = /^(load([A-Z_]\w*)?|reload\w*|refetch\w*)$/;

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(m|c)?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** The called name: `foo` for `foo()`, `bar` for `a.b.bar()`. */
function calleeName(call) {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function stringValue(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/** Top-level `const NAME = "…"` string constants of the file. */
function stringConstants(source) {
  const constants = new Map();
  for (const statement of source.statements) {
    const list = ts.isVariableStatement(statement) ? statement.declarationList : null;
    if (!list || !(list.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of list.declarations) {
      const value = stringValue(declaration.initializer);
      if (ts.isIdentifier(declaration.name) && value !== null) constants.set(declaration.name.text, value);
    }
  }
  return constants;
}

/** Names bound by the file's import declarations. */
function importedNames(source) {
  const names = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const clause = statement.importClause;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) names.add(element.name.text);
    if (bindings && ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
  }
  return names;
}

/** The data-loading call inside `node` (searching nested functions too), or null. */
function findLoadingCalls(node, imported) {
  const found = [];
  const visit = (child) => {
    if (ts.isCallExpression(child)) {
      const name = calleeName(child);
      const callee = child.expression;
      const rootName = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        ? callee.expression.text
        : null;
      if (name === "fetch" && ts.isIdentifier(callee)) found.push({ node: child, what: "fetch(" });
      else if (name && /Action$/.test(name) && (imported.has(name) || (rootName && imported.has(rootName)))) {
        found.push({ node: child, what: `${name}(` });
      } else if (name && LOADER_NAME.test(name)) found.push({ node: child, what: `${name}(` });
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

function isFunctionLike(node) {
  return node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

/**
 * The violations in one file's text. `file` is used for the keep-list and
 * the output; it may be absolute or relative to the app root.
 */
export function checkSource(file, text) {
  const rel = relative(APP_ROOT, resolve(APP_ROOT, file)).split(sep).join("/");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const lines = text.split(/\r?\n/);
  const constants = stringConstants(source);
  const imported = importedNames(source);
  const violations = [];
  const seen = new Set();

  const report = (node, pattern) => {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (ALLOW_COMMENT.test(lines[line - 1] ?? "")) return;
    const key = `${line}:${pattern}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ file: rel, line, pattern });
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const callee = node.expression;

      // router.refresh(
      if (
        name === "refresh" &&
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "router"
      ) {
        report(node, "router.refresh(");
      }

      // revalidatePath(
      if (name === "revalidatePath" && ts.isIdentifier(callee)) {
        const isLayoutRoot = stringValue(node.arguments[0]) === "/" && stringValue(node.arguments[1]) === "layout";
        const allowed = rel.startsWith(SCREEN_HELPERS_DIR) || (isLayoutRoot && LAYOUT_KEEP_LIST.has(rel));
        if (!allowed) report(node, "revalidatePath(");
      }

      // setInterval( that fetches
      if (name === "setInterval" && isFunctionLike(node.arguments[0])) {
        const calls = findLoadingCalls(node.arguments[0], imported);
        if (calls.length > 0) report(node, `setInterval( → ${calls[0].what}`);
      }

      // useEffect / startTransition bodies that load data
      if (name && EFFECT_HOOKS.has(name) && isFunctionLike(node.arguments[0])) {
        for (const call of findLoadingCalls(node.arguments[0], imported)) report(call.node, `${name} → ${call.what}`);
      }

      // useState(initial…) / useState(props.…)
      if (name === "useState" && node.arguments[0]) {
        let arg = node.arguments[0];
        if (ts.isArrowFunction(arg) && !ts.isBlock(arg.body)) arg = arg.body;
        const argText = arg.getText(source);
        if (/^initial[A-Z_]\w*/.test(argText) || /^props\./.test(argText)) report(node, `useState(${argText.split(/[^\w.]/)[0]}`);
      }

      // window.dispatchEvent(new (Custom)?Event("cincel:…"))
      if (
        name === "dispatchEvent" &&
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "window"
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isNewExpression(arg) && ts.isIdentifier(arg.expression) && /^(Custom)?Event$/.test(arg.expression.text)) {
          const first = arg.arguments?.[0];
          const value = stringValue(first) ?? (first && ts.isIdentifier(first) ? constants.get(first.text) : null);
          if (value && value.startsWith("cincel:")) report(node, `window.dispatchEvent(new ${arg.expression.text}("${value}")`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations.sort((a, b) => a.line - b.line);
}

/** Checks files on disk; returns every violation. */
export function checkFiles(files) {
  return files.flatMap((file) => {
    const absolute = resolve(process.cwd(), file);
    return checkSource(absolute, readFileSync(absolute, "utf8"));
  });
}

function main(argv) {
  const files = argv.filter((arg) => !arg.startsWith("-"));
  if (files.length === 0) {
    console.error("usage: node scripts/check-data-patterns.mjs <files…>");
    return 2;
  }
  const violations = checkFiles(files);
  for (const v of violations) console.log(`${v.file}:${v.line} ${v.pattern}`);
  if (violations.length > 0) {
    console.error(`\n${violations.length} old data pattern(s) found (plan §5.0).`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
