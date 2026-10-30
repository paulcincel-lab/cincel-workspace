// @vitest-environment node
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
const sidebarTsx = readFileSync(
  resolve(root, "components/layout/Sidebar.tsx"),
  "utf8",
);
const shadcnSidebarTsx = readFileSync(
  resolve(root, "components/ui/shadcn/sidebar.tsx"),
  "utf8",
);

/** Body of the first `{ ... }` block (no nested braces) opening at or after `from`. */
function blockBodyAt(from: number): string {
  const open = css.indexOf("{", from);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function token(body: string, name: string): string {
  const m = body.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim().toLowerCase() : "";
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SIDEBAR_TOKENS = [
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

const light = blockBodyAt(css.search(/^:root\s*\{/m));
const darkExplicit = blockBodyAt(
  css.search(/^\.dark,\s*\n:root\[data-theme="dark"\]/m),
);
const darkMedia = blockBodyAt(
  css.indexOf(":root", css.indexOf("@media (prefers-color-scheme: dark)")),
);

describe("sidebar tokens", () => {
  it("light mode uses the dark sidebar", () => {
    expect(token(light, "sidebar")).toBe("#0a0a0a");
    expect(token(light, "sidebar-foreground")).toBe("#d4d4d4");
    expect(token(light, "sidebar-primary")).toBe("#ffffff");
    expect(token(light, "sidebar-primary-foreground")).toBe("#0a0a0a");
    expect(token(light, "sidebar-accent")).toBe("#1f1f1f");
    expect(token(light, "sidebar-accent-foreground")).toBe("#ffffff");
    expect(token(light, "sidebar-border")).toBe("#262626");
    expect(token(light, "sidebar-ring")).toBe("#ffffff");
  });

  it("light mode: accent is a step lighter than the sidebar", () => {
    expect(luminance(token(light, "sidebar-accent"))).toBeGreaterThan(
      luminance(token(light, "sidebar")),
    );
  });

  it.each([
    ["light", light],
    ["dark", darkExplicit],
  ])(
    "%s: inactive, hover/active and primary text is at least 4.5:1",
    (_label, body) => {
      const pairs: [string, string][] = [
        ["sidebar-foreground", "sidebar"],
        ["sidebar-accent-foreground", "sidebar-accent"],
        ["sidebar-primary-foreground", "sidebar-primary"],
      ];
      for (const [fg, bg] of pairs) {
        expect(
          contrast(token(body, fg), token(body, bg)),
        ).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("light mode: focus ring is visible on the sidebar and on the hover/active item", () => {
    const ring = token(light, "sidebar-ring");
    expect(contrast(ring, token(light, "sidebar"))).toBeGreaterThanOrEqual(3);
    expect(
      contrast(ring, token(light, "sidebar-accent")),
    ).toBeGreaterThanOrEqual(3);
  });

  it("dark mode is unchanged and both dark blocks stay in sync", () => {
    expect(token(darkExplicit, "sidebar")).toBe("#1b1b1b");
    expect(token(darkExplicit, "sidebar-foreground")).toBe("#e4e4e4");
    expect(token(darkExplicit, "sidebar-accent")).toBe("#292929");
    for (const name of SIDEBAR_TOKENS) {
      expect(token(darkMedia, name)).toBe(token(darkExplicit, name));
    }
  });

  it("Sidebar.tsx keeps to the sidebar tokens (no hex colors or palette overrides)", () => {
    expect(sidebarTsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sidebarTsx).not.toMatch(
      /\b(?:bg|text|border|ring)-(?:white|black|gray|neutral|zinc|slate|stone)(?:-\d+)?\b/,
    );
  });

  it("active menu item is the primary pill, also on hover", () => {
    expect(shadcnSidebarTsx).toContain("data-active:bg-sidebar-primary");
    expect(shadcnSidebarTsx).toContain(
      "data-active:text-sidebar-primary-foreground",
    );
    expect(shadcnSidebarTsx).toContain("data-active:hover:bg-sidebar-primary");
  });
});
