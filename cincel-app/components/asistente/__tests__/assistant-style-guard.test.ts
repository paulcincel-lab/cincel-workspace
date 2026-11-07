// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";

const DIR = resolve(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** FE §18 item 15: assistant widgets carry no per-style markup; the library decides the style. */
describe("assistant components stay style-agnostic", () => {
  it.each(sources(DIR).map((p) => [p.slice(DIR.length + 1), p]))("%s imports no StyleView and does not branch on the style", (_, path) => {
    const src = readFileSync(path, "utf8");
    expect(src).not.toMatch(/StyleView/);
    expect(src).not.toMatch(/useStyle\s*\(/);
    expect(src).not.toMatch(/style\s*===/);
  });

  it("the migrated widgets import their library widget and keep no hard-coded colors", () => {
    const expected: Record<string, string> = {
      "AssistantChartMessage.tsx": "@/components/widgets/DistributionWidget",
      "AssistantCardMessage.tsx": "@/components/widgets/WidgetCard",
      "AssistantStatGridMessage.tsx": "@/components/widgets/KpiWidget",
      "AssistantListMessage.tsx": "@/components/widgets/AttentionListWidget",
    };
    for (const [file, widget] of Object.entries(expected)) {
      const src = readFileSync(join(DIR, file), "utf8");
      expect(src).toContain(`from "${widget}"`);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src).not.toMatch(/\b(emerald|amber|red|green|blue|slate|gray)-\d{2,3}\b/);
      expect(src).not.toMatch(/font-(bold|extrabold|black)\b/);
    }
  });
});
