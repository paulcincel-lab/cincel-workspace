/**
 * Module-graph guard (issue #916): each Ajustes page imports only its own
 * settings section list (`lib/shell/settings-sections/<page>`), never the
 * whole registry index, so a page bundle doesn't carry every other page's
 * section components. The registry index stays the union of the per-page lists.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const SECTIONS_DIR = join(ROOT, "lib", "shell", "settings-sections");
const PAGES = ["apariencia", "general", "horario", "integraciones", "notificaciones", "perfil"] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Strips block and line comments (keeps `://` in strings). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

/** Value (non-type) imports of the registry index. */
const INDEX_VALUE_IMPORT = /\bimport\s+(?!type\b)[^;]*\bfrom\s+["']@\/lib\/shell\/settings-sections["']/;

describe("settings sections registry split", () => {
  it("no app, component or registry file imports the registry index for values", () => {
    const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components")), ...walk(SECTIONS_DIR)];
    const offenders = files
      .filter((file) => !file.endsWith(join("settings-sections", "index.ts")))
      .filter((file) => INDEX_VALUE_IMPORT.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => relative(ROOT, file).split(sep).join("/"));
    expect(offenders).toEqual([]);
  });

  it.each(PAGES)("each section file of %s is listed in its page index", (page) => {
    const dir = join(SECTIONS_DIR, page);
    const index = readFileSync(join(dir, "index.ts"), "utf8");
    const sectionFiles = readdirSync(dir).filter((name) => name.endsWith(".tsx"));
    expect(sectionFiles.length).toBeGreaterThan(0);
    for (const name of sectionFiles) {
      expect(index).toContain(`from "./${name.replace(/\.tsx$/, "")}"`);
    }
  });

  it("the registry index spreads every per-page list", () => {
    const index = readFileSync(join(SECTIONS_DIR, "index.ts"), "utf8");
    for (const page of PAGES) {
      expect(index).toContain(`from "./${page}"`);
      expect(index).toContain(`...${page.toUpperCase()}_SECTIONS`);
    }
  });
});
