// @vitest-environment node
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf8");
const componentSrc = readFileSync(
  resolve(__dirname, "../../../components/asistente/AssistantChartMessage.tsx"),
  "utf8",
);

const LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#6250d6"];
const DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#9085e9"];

/** Body of the first `{ ... }` block (no nested braces) opening at or after `from`. */
function blockBodyAt(from: number): string {
  const open = css.indexOf("{", from);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function chartTokens(body: string): string[] {
  return [1, 2, 3, 4, 5].map((n) => {
    const m = body.match(new RegExp(`--chart-${n}:\\s*([^;]+);`));
    return m ? m[1].trim().toLowerCase() : "";
  });
}

describe("chart color tokens", () => {
  it("holds the categorical palette in :root (light)", () => {
    const start = css.search(/^:root\s*\{/m);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(chartTokens(blockBodyAt(start))).toEqual(LIGHT);
  });

  it("holds the dark palette in the .dark / [data-theme=dark] block", () => {
    const start = css.search(/^\.dark,\s*\n:root\[data-theme="dark"\]/m);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(chartTokens(blockBodyAt(start))).toEqual(DARK);
  });

  it("holds the dark palette under prefers-color-scheme: dark", () => {
    const media = css.indexOf("@media (prefers-color-scheme: dark)");
    expect(media).toBeGreaterThanOrEqual(0);
    const inner = css.indexOf(":root", media);
    expect(chartTokens(blockBodyAt(inner))).toEqual(DARK);
  });

  it("keeps the destructive red out of the categorical set", () => {
    const destructive = [...css.matchAll(/--destructive:\s*([^;]+);/g)].map((m) =>
      m[1].trim().toLowerCase(),
    );
    expect(destructive.length).toBeGreaterThan(0);
    for (const value of destructive) {
      expect([...LIGHT, ...DARK]).not.toContain(value);
    }
  });

  it("AssistantChartMessage reads chart tokens, not hard-coded hex", () => {
    expect(componentSrc).toContain("var(--chart-1)");
    expect(componentSrc).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("AssistantChartMessage renders through the shadcn ChartContainer", () => {
    expect(componentSrc).toContain('from "@/components/ui/shadcn/chart"');
    expect(componentSrc).toContain("<ChartContainer");
    expect(componentSrc).not.toContain("ResponsiveContainer");
  });
});
