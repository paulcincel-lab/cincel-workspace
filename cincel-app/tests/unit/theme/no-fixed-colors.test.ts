// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

/**
 * Colors in app/, components/ and lib/ come from the active theme: tokens
 * (`bg-chart-1`, `text-destructive-ink`, `var(--success)`), never a Tailwind
 * palette class, a hex, or an rgb()/hsl() literal. Files below are the only
 * places where a fixed color is correct, each with its reason. The `sidebar-*`
 * token scope has its own guard (sidebar-token-scope.test.ts).
 */
const ALLOWED: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^lib\/ui\/themes\.ts$/, reason: "theme token values" },
  { pattern: /^lib\/ui\/color\.ts$/, reason: "color parsing and compositing" },
  { pattern: /^lib\/ui\/tints\.ts$/, reason: "token tint math" },
  { pattern: /^lib\/ui\/appearance-css\.ts$/, reason: "card shadow presets (neutral, not a theme color)" },
  { pattern: /^lib\/validation\/redesign\.ts$/, reason: "token color validation" },
  { pattern: /^components\/ajustes\/TokenRow\.tsx$/, reason: "theme editor color input" },
  { pattern: /^components\/ui\/shadcn\/(dialog|alert-dialog|sheet)\.tsx$/, reason: "shadcn overlay scrim" },
  { pattern: /^components\/ui\/shadcn\/chart\.tsx$/, reason: "recharts selector for its default grid stroke" },
  { pattern: /^components\/inicio\/reencode-photo\.ts$/, reason: "canvas background behind transparent photos" },
  { pattern: /^lib\/errors\.ts$/, reason: "devtools console styling" },
];

const PALETTE_CLASS =
  /(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border|border-[trblxy]|ring|ring-offset|outline|divide|fill|stroke|from|via|to|shadow|accent|caret|decoration|placeholder)-(?:(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}|white|black)(?:\/\d+)?(?![\w-])/;
const HEX_LITERAL = /["'`]#[0-9a-fA-F]{3,8}["'`;]|[\s(,:]#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w])/;
const FUNCTION_COLOR = /\b(?:rgba?|hsla?|oklch|oklab)\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** The 1-based lines of one source text that hold a fixed color. Comment lines are skipped. */
export function fixedColorOffenses(source: string): number[] {
  const hits: number[] = [];
  source.split("\n").forEach((line, index) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    if (PALETTE_CLASS.test(line) || HEX_LITERAL.test(line) || FUNCTION_COLOR.test(line)) hits.push(index + 1);
  });
  return hits;
}

describe("no fixed colors outside the theme", () => {
  it("detects palette classes, hex and rgb/hsl literals, and ignores tokens and comments", () => {
    expect(fixedColorOffenses('<p className="text-red-600">x</p>')).toEqual([1]);
    expect(fixedColorOffenses('<p className="dark:text-yellow-400 font-bold">x</p>')).toEqual([1]);
    expect(fixedColorOffenses('<i className="stroke-cyan-500" />')).toEqual([1]);
    expect(fixedColorOffenses('<i className="bg-red-500/20" />')).toEqual([1]);
    expect(fixedColorOffenses('<i className="bg-white" />')).toEqual([1]);
    expect(fixedColorOffenses('const c = "#ff0000";')).toEqual([1]);
    expect(fixedColorOffenses("const style = { color: '#abc' };")).toEqual([1]);
    expect(fixedColorOffenses('const c = "rgba(0,0,0,0.5)";')).toEqual([1]);
    expect(fixedColorOffenses('const c = "hsl(10 20% 30%)";')).toEqual([1]);
    expect(fixedColorOffenses('<p className="text-destructive-ink bg-chart-1 stroke-chart-3" />')).toEqual([]);
    expect(fixedColorOffenses('<p className="text-[color:var(--chart-1-ink)] bg-tint-success" />')).toEqual([]);
    expect(fixedColorOffenses('<p className="border-border text-muted-foreground" />')).toEqual([]);
    expect(fixedColorOffenses("// text-red-600 and #ff0000 in a comment")).toEqual([]);
    expect(fixedColorOffenses(" * see issue #1138 and #123456 below")).toEqual([]);
    expect(fixedColorOffenses("const label = `Tarea #1138`;")).toEqual([]);
  });

  it("every allowlist entry still matches a file", () => {
    const files = ["app", "components", "lib"].flatMap((dir) => walk(join(root, dir))).map((f) => relative(root, f).split("\\").join("/"));
    for (const entry of ALLOWED) {
      expect(
        files.some((f) => entry.pattern.test(f)),
        `Stale allowlist entry (${entry.reason}): ${entry.pattern}`
      ).toBe(true);
    }
  });

  it("no Tailwind palette class, hex, rgb() or hsl() literal in app/, components/ or lib/", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "lib"]) {
      for (const file of walk(join(root, dir))) {
        const rel = relative(root, file).split("\\").join("/");
        if (ALLOWED.some((entry) => entry.pattern.test(rel))) continue;
        for (const line of fixedColorOffenses(readFileSync(file, "utf8"))) offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      `Use a theme token (bg-chart-N, text-[color:var(--chart-N-ink)], text-destructive-ink, text-warning-ink, var(--success)…) instead of a fixed color:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
