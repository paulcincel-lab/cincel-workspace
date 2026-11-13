import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineTool, renameLegacyInput } from "@/lib/assistant/define-tool";
import { summarizeRebalanceWorkload } from "@/lib/assistant/tool-summaries";

describe("tool inputs stored with the old tramo names", () => {
  it("renameLegacyInput moves the old name only when the new one is absent", () => {
    expect(renameLegacyInput({ tramo: "Diseño" }, { tramo: "etapa" })).toEqual({ etapa: "Diseño" });
    expect(renameLegacyInput({ tramo: "a", etapa: "b" }, { tramo: "etapa" })).toEqual({ etapa: "b" });
    expect(renameLegacyInput("x", { tramo: "etapa" })).toBe("x");
  });

  it("a tool with legacyInputNames validates an old input and keeps the model-facing schema", async () => {
    const tool = defineTool({
      name: "demo",
      description: "demo",
      schema: z.object({ etapa: z.string().optional(), max: z.number().optional() }),
      legacyInputNames: { tramo: "etapa" },
      capability: () => true,
      available: () => true,
      confirm: true,
      write: true,
      summarize: () => "demo",
      run: async (_ctx, input) => input,
    });
    const aiTool = tool.toAiTool({ user: {} as never, context: { route: "/" }, threadId: null });
    const schema = aiTool.inputSchema as unknown as {
      jsonSchema: { properties?: Record<string, unknown> };
      validate(value: unknown): Promise<{ success: boolean; value?: unknown }> | { success: boolean; value?: unknown };
    };
    expect(Object.keys(schema.jsonSchema.properties ?? {})).toEqual(["etapa", "max"]);
    const old = await schema.validate({ tramo: "Diseño", max: 3 });
    expect(old).toMatchObject({ success: true, value: { etapa: "Diseño", max: 3 } });
  });

  it("the confirmation summary reads the old tramo field", () => {
    expect(summarizeRebalanceWorkload({ tramo: "Diseño" })).toContain("Diseño");
  });
});
