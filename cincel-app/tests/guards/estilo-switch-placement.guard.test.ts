/**
 * Estilo switch placement guard: staff pages get the switch from the page
 * header (`components/widgets/PageHeader.tsx`), project pages from
 * `ProjectTabs` (they use tabs, not the page header) and the portal from
 * `PortalStyleSwitch`. No other source file imports `EstiloSwitch`, so a page
 * never shows two switches or one in the wrong place.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SCANNED_DIRS = ["app", "components", "lib", "hooks"];
const SWITCH_FILE = "components/shell/EstiloSwitch.tsx";
const ALLOWED_FILES = new Set([
  "components/widgets/PageHeader.tsx",
  "components/proyectos/ProjectTabs.tsx",
  "components/portal/PortalStyleSwitch.tsx",
]);

/** A static or dynamic import of the EstiloSwitch module, by alias or relative path. */
const IMPORT_PATTERN = /\bfrom\s+["'][^"']*\/EstiloSwitch["']|\bimport\s*\(\s*["'][^"']*\/EstiloSwitch["']\s*\)/;

/** Strips block and line comments (keeps `://` in strings such as URLs). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

function importsEstiloSwitch(source: string): boolean {
  return IMPORT_PATTERN.test(stripComments(source));
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

describe("Estilo switch placement guard", () => {
  it("EstiloSwitch is imported only by the page header, ProjectTabs and the portal switch", () => {
    const importers: string[] = [];
    for (const path of sourceFiles()) {
      if (path === SWITCH_FILE || isTestFile(path)) continue;
      if (importsEstiloSwitch(readFileSync(join(ROOT, path), "utf8"))) importers.push(path);
    }
    expect(importers.filter((path) => !ALLOWED_FILES.has(path))).toEqual([]);
    expect(importers.sort()).toEqual([...ALLOWED_FILES].sort());
    // Reads every source file of the repo; slow on a busy CI runner.
  }, 60_000);

  it("scans the folders that hold the pages", () => {
    const files = sourceFiles();
    expect(files).toContain(SWITCH_FILE);
    expect(files).toContain("components/widgets/PageHeader.tsx");
    expect(files.some((f) => f.startsWith("app/(staff)/"))).toBe(true);
  });

  describe("detects", () => {
    const bad: [string, string][] = [
      ["an alias import", `import { EstiloSwitch } from "@/components/shell/EstiloSwitch";`],
      ["a relative import", `import { EstiloSwitch } from "./EstiloSwitch";`],
      ["a type-only import", `import type { EstiloSwitchProps } from "../shell/EstiloSwitch";`],
      ["a dynamic import", `const m = await import("@/components/shell/EstiloSwitch");`],
    ];
    for (const [label, source] of bad) {
      it(label, () => {
        expect(importsEstiloSwitch(source)).toBe(true);
      });
    }
  });

  describe("does not flag", () => {
    const fine: [string, string][] = [
      ["the page header", `import { PageHeader } from "@/components/shell/PageHeader";`],
      ["a mention in a comment", `// The header renders the EstiloSwitch from "@/components/shell/EstiloSwitch".`],
      ["the portal switch", `import { PortalStyleSwitch } from "@/components/portal/PortalStyleSwitch";`],
    ];
    for (const [label, source] of fine) {
      it(label, () => {
        expect(importsEstiloSwitch(source)).toBe(false);
      });
    }
  });
});
