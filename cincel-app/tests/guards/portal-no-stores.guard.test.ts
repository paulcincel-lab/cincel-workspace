// @vitest-environment node
/**
 * Portal state guard (Query Migration Phase 11, zustand.md §1 Portal): the portal has no Zustand store and no
 * React context for app state. Its style is the `cincel-portal-style` cookie plus `StyleProvider`, server data
 * lives in the query cache (`portal.*`), and the upload queue, drag state and file browser state stay local or
 * in the URL. So nothing under `app/portal` or `components/portal` imports `lib/stores/*` or creates a context,
 * and the trees carry none of the old data patterns (`scripts/check-data-patterns.mjs`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { checkSource } from "../../scripts/check-data-patterns.mjs";

const ROOT = join(__dirname, "../..");
const TREES = ["app/portal", "components/portal"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = TREES.flatMap((tree) => sources(join(ROOT, tree))).map((path) => ({
  path: relative(ROOT, path).split("\\").join("/"),
  source: readFileSync(path, "utf8"),
}));

/** `from "@/lib/stores/…"`, a relative path into `lib/stores`, or a dynamic `import(…)` of one. */
const STORE_IMPORT = /(?:from\s+|import\s*\(\s*)["'](?:@\/lib\/stores(?:\/[^"']*)?|(?:\.\.\/)+lib\/stores(?:\/[^"']*)?)["']/;

describe("portal state guard", () => {
  it("scans the portal trees", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { path, source } of files) {
    it(`${path} imports no lib/stores module`, () => {
      expect(source).not.toMatch(STORE_IMPORT);
      expect(source).not.toMatch(/\bfrom\s+["']zustand(?:\/[^"']*)?["']/);
    });

    it(`${path} creates no React context`, () => {
      expect(source).not.toMatch(/\bcreateContext\s*\(/);
    });

    it(`${path} has none of the old data patterns`, () => {
      expect(checkSource(path, source)).toEqual([]);
    });
  }
});
