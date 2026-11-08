// @vitest-environment node
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const sidebarTsx = readFileSync(resolve(root, "components/shell/Sidebar.tsx"), "utf8");
const shadcnSidebarTsx = readFileSync(resolve(root, "components/ui/shadcn/sidebar.tsx"), "utf8");

/**
 * The shell sidebar takes its colors from the sidebar tokens only; their
 * values and contrast are covered by the `globals.css` drift guard and
 * `CONTRAST_PAIRS` (`lib/ui/contrast.ts`).
 */
describe("sidebar tokens", () => {
  it("Sidebar.tsx keeps to the sidebar tokens (no hex colors or palette overrides)", () => {
    expect(sidebarTsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(sidebarTsx).not.toMatch(/\b(?:bg|text|border|ring)-(?:white|black|gray|neutral|zinc|slate|stone)(?:-\d+)?\b/);
  });

  it("active menu item is the primary pill, also on hover", () => {
    expect(shadcnSidebarTsx).toContain("data-active:bg-sidebar-primary");
    expect(shadcnSidebarTsx).toContain("data-active:text-sidebar-primary-foreground");
    expect(shadcnSidebarTsx).toContain("data-active:hover:bg-sidebar-primary");
  });
});
