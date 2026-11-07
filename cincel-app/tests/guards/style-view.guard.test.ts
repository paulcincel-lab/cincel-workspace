/**
 * Style guard (redesign FE §17, §18 item 15): every difference between Visual,
 * Esencial and Analítico lives inside the widget library. No file outside
 * `components/widgets/*` may import `StyleView` or branch on the presentation
 * style. Allowlist: `components/widgets/*` (everything) and
 * `components/shell/EstiloSwitch.tsx` / `components/shell/StyleProvider.tsx`
 * (they read and set the style but render no per-style markup).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCANNED_DIRS = ["app", "components", "lib", "hooks"];
const ALLOWED_DIRS = ["components/widgets/"];
const ALLOWED_FILES = new Set(["components/shell/EstiloSwitch.tsx", "components/shell/StyleProvider.tsx"]);

const STYLE_LITERAL = String.raw`["'\`](?:visual|esencial|analitico)["'\`]`;

/**
 * Each rule: what it catches and the pattern (run on source with comments
 * stripped). `ui` rules apply to rendering code (`app/`, `components/`,
 * `hooks/`); `lib/` resolves and validates the style and is only checked for
 * `StyleView` imports.
 */
const STYLE_RULES: { name: string; ui: boolean; pattern: RegExp }[] = [
  { name: "imports StyleView", ui: false, pattern: /\bimport\b[^;]*\bStyleView\b[^;]*\bfrom\b/ },
  { name: "imports the StyleView module", ui: false, pattern: /\bfrom\s+["'][^"']*\/StyleView["']|\bimport\s*\(\s*["'][^"']*\/StyleView["']\s*\)/ },
  { name: "renders StyleView", ui: false, pattern: /<StyleView\b/ },
  { name: "compares with a style name", ui: true, pattern: new RegExp(String.raw`[!=]==?\s*${STYLE_LITERAL}|${STYLE_LITERAL}\s*[!=]==?`) },
  { name: "switches on a style name", ui: true, pattern: new RegExp(String.raw`\bcase\s+${STYLE_LITERAL}\s*:`) },
  { name: "compares the style", ui: true, pattern: /\b(?:style|presentationStyle)\s*[!=]==?|[!=]==?\s*(?:[A-Za-z_$][\w$]*\.)*(?:style|presentationStyle)\b/ },
  { name: "switches on the style", ui: true, pattern: /\bswitch\s*\(\s*(?:[A-Za-z_$][\w$]*\.)*(?:style|presentationStyle)\s*\)/ },
  { name: "reads useStyle().style", ui: true, pattern: /\buseStyle\s*\(\s*\)\s*\.\s*style\b/ },
  { name: "styles per presentation style in CSS", ui: true, pattern: /data-\[style=|\[data-style=|data-style=["'](?:visual|esencial|analitico)/ },
];

/** Strips block and line comments (keeps `://` in strings such as URLs). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** The rules a source file breaks; `ui` false checks only the `StyleView` import rules. */
function styleViolations(source: string, ui = true): string[] {
  const code = stripComments(source);
  return STYLE_RULES.filter((rule) => (ui || !rule.ui) && rule.pattern.test(code)).map((rule) => rule.name);
}

function isUiCode(path: string): boolean {
  return !path.startsWith("lib/");
}

function isAllowed(path: string): boolean {
  return ALLOWED_FILES.has(path) || ALLOWED_DIRS.some((dir) => path.startsWith(dir));
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(path) || path.includes("/__tests__/") || path.includes("/__fixtures__/");
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
}

function sourceFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCANNED_DIRS) walk(join(ROOT, dir), files);
  return files.map((file) => relative(ROOT, file).split(sep).join("/"));
}

describe("style guard", () => {
  it("only widgets (plus EstiloSwitch and StyleProvider) import StyleView or branch on the style", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles()) {
      if (isAllowed(path) || isTestFile(path)) continue;
      const broken = styleViolations(readFileSync(join(ROOT, path), "utf8"), isUiCode(path));
      if (broken.length) offenders.push(`${path}: ${broken.join(", ")}`);
    }
    expect(offenders).toEqual([]);
    // Reads every source file of the repo; slow on a busy CI runner.
  }, 60_000);

  it("scans the app, components and lib folders", () => {
    const files = sourceFiles();
    expect(files).toContain("components/v2/layout/PageHeader.tsx");
    expect(files).toContain("components/widgets/StyleView.tsx");
    expect(files.some((f) => f.startsWith("app/"))).toBe(true);
    expect(files.some((f) => f.startsWith("lib/"))).toBe(true);
  });

  it("allowlists exactly the widget library, EstiloSwitch and StyleProvider", () => {
    expect(isAllowed("components/widgets/KpiWidget.tsx")).toBe(true);
    expect(isAllowed("components/shell/EstiloSwitch.tsx")).toBe(true);
    expect(isAllowed("components/shell/StyleProvider.tsx")).toBe(true);
    expect(isAllowed("components/shell/AppShell.tsx")).toBe(false);
    expect(isAllowed("components/patterns/ListPage.tsx")).toBe(false);
    expect(isAllowed("app/(staff)/inicio/page.tsx")).toBe(false);
  });

  it("checks lib/ only for StyleView imports", () => {
    expect(isUiCode("lib/ui/preferences.ts")).toBe(false);
    expect(isUiCode("components/inicio/InicioClient.tsx")).toBe(true);
    expect(styleViolations(`if (cookie.style === "visual") return true;`, false)).toEqual([]);
    expect(styleViolations(`import { StyleView } from "@/components/widgets/StyleView";`, false)).toEqual([
      "imports StyleView",
      "imports the StyleView module",
    ]);
  });

  describe("detects", () => {
    const bad: [string, string][] = [
      ["a named StyleView import", `import { StyleView } from "@/components/widgets/StyleView";`],
      ["a StyleView import from the widgets barrel", `import { KpiWidget, StyleView } from "@/components/widgets";`],
      ["a dynamic StyleView import", `const m = await import("@/components/widgets/StyleView");`],
      ["style ===", `const { style } = useStyle();\nif (style === "esencial") return null;`],
      ["a reversed comparison", `return "analitico" !== appearance.style ? a : b;`],
      ["useStyle().style in a ternary", `const big = useStyle().style ? 1 : 2;`],
      ["a switch on the style", `switch (ctx.style) { default: break; }`],
      ["a case per style", `switch (x) { case "visual": return 1; }`],
      ["per-style CSS", `<div className="data-[style=esencial]:hidden" />`],
    ];
    for (const [label, source] of bad) {
      it(label, () => {
        expect(styleViolations(source).length).toBeGreaterThan(0);
      });
    }
  });

  describe("does not flag", () => {
    const ok: [string, string][] = [
      ["a comment that names StyleView", `// pages never import StyleView\n/* style === "visual" */ export const a = 1;`],
      ["passing data to a widget", `return <KpiWidget data={kpis} />;`],
      ["the EstiloSwitch and the provider", `<StyleProvider style={page.style} scope="staff"><EstiloSwitch /></StyleProvider>`],
      ["a CSS rule on the presence of data-style", `<h1 className="[html[data-style]_&]:text-[22px]" />`],
      ["a URL in a string", `const url = "https://cutto.cloudketer.dev"; // link`],
    ];
    for (const [label, source] of ok) {
      it(label, () => {
        expect(styleViolations(source)).toEqual([]);
      });
    }
  });
});
