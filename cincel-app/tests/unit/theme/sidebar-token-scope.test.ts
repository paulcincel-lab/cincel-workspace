// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");

/**
 * Where the `sidebar-*` color tokens may be used: the sidebar and bottom tabs,
 * the shadcn sidebar primitive and the login brand panel (a surface painted
 * with the sidebar colors on purpose). Anywhere else the sidebar can be dark
 * on a light page (Grafito), which leaves light text on light cards. Regions
 * between `sidebar-tokens:allow-start` and `sidebar-tokens:allow-end` are exempt.
 */
const ALLOWED = [/^components\/shell\//, /^components\/ui\/shadcn\/sidebar\.tsx$/, /^components\/auth\/AuthSplitLayout\.tsx$/];

const SIDEBAR_COLOR_CLASS =
  /(?:^|[\s"'`:])(?:text|bg|border|border-[trblxy]|ring|ring-offset|outline|divide|fill|stroke|from|via|to|shadow|accent|caret|decoration|placeholder)-sidebar(?:-(?:foreground|primary|primary-foreground|accent|accent-foreground|border|ring))?(?:\/\d+)?(?=$|[\s"'`\]])/;
const SIDEBAR_VAR = /var\(--sidebar(?:-[a-z-]+)?\)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** The 1-based lines of one source text that use a sidebar color token. */
function sidebarTokenOffenses(source: string): number[] {
  const hits: number[] = [];
  let allowed = false;
  source.split("\n").forEach((line, index) => {
    if (line.includes("sidebar-tokens:allow-start")) allowed = true;
    if (!allowed && (SIDEBAR_COLOR_CLASS.test(line) || SIDEBAR_VAR.test(line))) hits.push(index + 1);
    if (line.includes("sidebar-tokens:allow-end")) allowed = false;
  });
  return hits;
}

describe("sidebar color tokens stay in the sidebar", () => {
  it("detects offending classes and honors the allow region", () => {
    expect(sidebarTokenOffenses('<p className="text-sm text-sidebar-foreground">x</p>')).toEqual([1]);
    expect(sidebarTokenOffenses('<div className="rounded bg-sidebar p-2" />')).toEqual([1]);
    expect(sidebarTokenOffenses('<i className="hover:bg-sidebar-accent border-sidebar-border" />')).toEqual([1]);
    expect(sidebarTokenOffenses('<i className="ring-2 ring-sidebar" />')).toEqual([1]);
    expect(sidebarTokenOffenses('<i style={{ color: "var(--sidebar-foreground)" }} />')).toEqual([1]);
    expect(sidebarTokenOffenses('<i className="text-muted-foreground" data-slot="sidebar-projects" />')).toEqual([]);
    const source = ["// sidebar-tokens:allow-start", 'a="bg-sidebar"', "// sidebar-tokens:allow-end", 'b="bg-sidebar"'].join("\n");
    expect(sidebarTokenOffenses(source)).toEqual([4]);
  });

  it("no sidebar-* color token outside the sidebar, bottom tabs, shadcn sidebar and the login panel", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components"]) {
      for (const file of walk(join(root, dir))) {
        const rel = relative(root, file).split("\\").join("/");
        if (ALLOWED.some((pattern) => pattern.test(rel))) continue;
        for (const line of sidebarTokenOffenses(readFileSync(file, "utf8"))) offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, `Use muted-foreground / foreground / muted / border outside the sidebar:\n${offenders.join("\n")}`).toEqual([]);
  });
});
