// @vitest-environment node
/**
 * Charts load on demand (issue 922): recharts and the shadcn chart wrapper
 * are imported only by the modules in components/widgets/charts/ (loaded
 * through `charts/lazy`), the shadcn wrapper itself and the assistant's
 * line chart (loaded on demand by `AssistantChartMessage`). Any other
 * static import would put recharts back into the first-load JS of every
 * route that shows a widget.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../..");
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "__snapshots__", "fixtures"]);
const SOURCE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx)$/;

/** A value import (not `import type`) of recharts or the shadcn chart wrapper. */
const VALUE_CHART_IMPORT = /^\s*import\s+(?!type\b)[^;]*?from\s+["'](?:recharts|@\/components\/ui\/shadcn\/chart)["']/m;

const ALLOWED = new Set([
  "components/ui/shadcn/chart.tsx",
  "components/widgets/charts/DonutChart.tsx",
  "components/widgets/charts/AreaSeriesChart.tsx",
  "components/asistente/AssistantLineChart.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !TEST_FILE.test(name)) out.push(full);
  }
  return out;
}

describe("charts are lazy-loaded", () => {
  it("only the chart modules import recharts or the shadcn chart wrapper", () => {
    const offenders = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
      .map((file) => relative(ROOT, file).split(sep).join("/"))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => VALUE_CHART_IMPORT.test(readFileSync(join(ROOT, rel), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the widgets reach the charts through charts/lazy", () => {
    for (const widget of ["components/widgets/DistributionWidget.tsx", "components/widgets/LineSeriesWidget.tsx"]) {
      const source = readFileSync(join(ROOT, widget), "utf8");
      expect(source, widget).toMatch(/charts\/lazy["']/);
    }
    const lazy = readFileSync(join(ROOT, "components/widgets/charts/lazy.tsx"), "utf8");
    expect(lazy).toMatch(/import\(["']\.\/DonutChart["']\)/);
    expect(lazy).toMatch(/import\(["']\.\/AreaSeriesChart["']\)/);
    const assistant = readFileSync(join(ROOT, "components/asistente/AssistantChartMessage.tsx"), "utf8");
    expect(assistant).toMatch(/import\(["']\.\/AssistantLineChart["']\)/);
  });
});
