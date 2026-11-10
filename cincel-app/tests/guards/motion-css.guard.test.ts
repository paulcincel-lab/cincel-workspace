/**
 * Motion guard (Estilos): the shared motion utilities live in
 * `app/globals.css` after `@layer base` (outside the generated token block),
 * and each one turns its animation and transition off under
 * `prefers-reduced-motion: reduce`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

const UTILITIES = [
  "anim-in",
  "row-new",
  "rise",
  "lift",
  "drag-lift",
  "draw",
  "grow",
  "grow-x",
  "ring",
  "ring-in",
  "chev",
  "spin",
  "glow",
  "typing",
] as const;

/** Body of the `{ … }` block that opens at or after `from`, braces balanced. */
function blockAt(css: string, from: number): { start: number; body: string } {
  const open = css.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return { start: from, body: css.slice(open + 1, i) };
    }
  }
  throw new Error(`unbalanced block at ${from}`);
}

function utilities(css: string): Map<string, { start: number; body: string }> {
  const found = new Map<string, { start: number; body: string }>();
  for (const match of css.matchAll(/@utility\s+([\w-]+)\s*\{/g)) found.set(match[1], blockAt(css, match.index));
  return found;
}

const REDUCED = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/;

describe("motion utilities in app/globals.css", () => {
  const found = utilities(CSS);

  it("defines every shared motion utility", () => {
    for (const name of UTILITIES) expect(found.has(name), name).toBe(true);
  });

  it("every motion utility has a reduced-motion rule", () => {
    for (const name of UTILITIES) {
      const utility = found.get(name);
      expect(utility, name).toBeDefined();
      const reduced = REDUCED.exec(utility!.body);
      expect(reduced, `${name} has no prefers-reduced-motion rule`).not.toBeNull();
      const rule = blockAt(utility!.body, reduced!.index).body;
      expect(rule, `${name} still animates under reduced motion`).toMatch(/animation:\s*none/);
      expect(rule, `${name} still transitions under reduced motion`).toMatch(/transition:\s*none/);
    }
  });

  it("utilities live after `@layer base`", () => {
    const layerBase = CSS.indexOf("@layer base {");
    expect(layerBase).toBeGreaterThan(0);
    for (const name of UTILITIES) expect(found.get(name)!.start, name).toBeGreaterThan(layerBase);
    for (const match of CSS.matchAll(/@keyframes\s+[\w-]+/g)) expect(match.index, match[0]).toBeGreaterThan(layerBase);
  });

  it("every animation waits for --anim-delay", () => {
    for (const name of UTILITIES) {
      const body = found.get(name)!.body;
      for (const decl of body.matchAll(/animation:\s*([^;]+);/g)) {
        if (decl[1].trim() === "none") continue;
        expect(decl[1], name).toContain("var(--anim-delay, 0ms)");
      }
    }
  });

  it("only spin, glow and typing loop forever", () => {
    const infinite = [...found].filter(([, u]) => /\binfinite\b/.test(u.body)).map(([name]) => name);
    expect(infinite.sort()).toEqual(["glow", "spin", "typing"]);
  });
});
