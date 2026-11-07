// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Portal side of the style guard (FE §17, §18 item 15): no portal page or component imports `StyleView` or
 * branches on the presentation style; every difference between Visual, Esencial and Analítico lives in
 * `components/widgets/*`. Also keeps the new portal project page files on tokens and weights ≤ 600.
 */

const appRoot = resolve(__dirname, "../..");
const TREES = ["app/portal", "components/portal", "lib/portal"];
const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return SOURCE.test(name) && !TEST.test(name) ? [path] : [];
  });
}

const files = TREES.flatMap((tree) => walk(resolve(appRoot, tree))).map((path) => ({
  path: relative(appRoot, path),
  source: readFileSync(path, "utf8"),
}));

/** Files this page added or restyled; legacy branches elsewhere keep their weights until cleanup. */
const REDESIGN_FILES = [
  "components/portal/PortalProjectOverview.tsx",
  "components/portal/PortalStyleSwitch.tsx",
  "lib/portal/overview.ts",
  "lib/portal/style.ts",
  "lib/portal/style-server.ts",
];

describe("portal style guard", () => {
  it("scans the portal trees", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const { path, source } of files) {
    it(`${path} renders no per-style markup`, () => {
      expect(source).not.toMatch(/\bStyleView\b/);
      expect(source).not.toMatch(/\bstyle\s*[!=]==/);
      expect(source).not.toMatch(/useStyle\(\)\.style/);
      expect(source).not.toMatch(/\bestilo\s*[!=]==/);
    });
  }

  for (const path of REDESIGN_FILES) {
    it(`${path} uses tokens only and weights of 600 or below`, () => {
      const source = readFileSync(resolve(appRoot, path), "utf8");
      expect(source).not.toMatch(/\bfont-(bold|extrabold|black)\b/);
      expect(source).not.toMatch(/\b(bg|text|border|ring|fill|stroke)-\[(#|rgb|hsl|oklch)/);
      expect(source).not.toMatch(/\b(bg|text|border)-(red|green|blue|amber|yellow|rose|emerald|slate|gray|zinc)-\d/);
    });
  }
});
