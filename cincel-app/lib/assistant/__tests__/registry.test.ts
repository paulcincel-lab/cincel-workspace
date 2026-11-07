import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildToolSet, defineTool, type ToolRunContext } from "@/lib/assistant/define-tool";
import { summarizeToolCall, summaryOf, toolSummaries } from "@/lib/assistant/tool-summaries";
import { DEFINED_TOOLS, buildDefinedTools, findDefinedTool } from "@/lib/assistant/tools/index";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const TOOLS_DIR = join(__dirname, "..", "tools");

const user = {
  member: { id: "staff-1", name: "Ana Ruiz" },
  email: "ana@cincel.mx",
  access: "Administrador",
} as unknown as AuthenticatedUser;

const ctx: ToolRunContext = { user, context: { route: "/asistente" }, threadId: "thread-1" };

function domainFiles(): string[] {
  return readdirSync(TOOLS_DIR)
    .filter((file) => file.endsWith(".ts") && file !== "index.ts" && !file.includes(".test."))
    .map((file) => file.replace(/\.ts$/, ""));
}

describe("assistant tool registry", () => {
  it("imports every domain file of lib/assistant/tools", () => {
    const index = readFileSync(join(TOOLS_DIR, "index.ts"), "utf8");
    for (const domain of domainFiles()) {
      expect(index, `tools/index.ts imports ./${domain}`).toContain(`from "./${domain}"`);
    }
  });

  it("domain files import the flags module of every redesign action they call (Rule 3)", () => {
    const ACTIONS_DIR = join(__dirname, "..", "..", "actions");
    for (const domain of domainFiles()) {
      const source = readFileSync(join(TOOLS_DIR, `${domain}.ts`), "utf8");
      const imports = [
        ...source.matchAll(/import\s*\{([^}]*)\}\s*from\s+["']@\/lib\/actions\/([a-z-]+-actions)["']/g),
        ...source.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']@\/lib\/actions\/([a-z-]+-actions)["']\s*\)/g),
      ];
      for (const [, names, module] of imports) {
        const flagsPath = join(ACTIONS_DIR, `${module}.flags.ts`);
        let flags: string;
        try {
          flags = readFileSync(flagsPath, "utf8");
        } catch {
          continue; // an actions file without redesign actions has no flags module
        }
        const flagged = names
          .split(",")
          .map((name) => name.trim().split(/\s+as\s+/)[0])
          .filter((name) => name && new RegExp(`\\b${name}\\s*:`).test(flags));
        if (flagged.length === 0) continue;
        expect(source, `${domain}.ts calls ${flagged.join(", ")} and imports ${module}.flags`).toMatch(
          new RegExp(`["']@/lib/actions/${module}\\.flags["']`),
        );
      }
    }
  });

  it("has unique snake_case names", () => {
    const names = DEFINED_TOOLS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("shares each tool's summarize function with the client map", () => {
    for (const entry of DEFINED_TOOLS) {
      expect(toolSummaries[entry.name], entry.name).toBe(entry.definition.summarize);
    }
  });

  it("builds only the tools that are capable and available", () => {
    const expected = DEFINED_TOOLS.filter(
      (entry) => entry.definition.capability(user) && entry.definition.available({ user, context: ctx.context }),
    ).map((entry) => entry.name);
    expect(Object.keys(buildDefinedTools(ctx)).sort()).toEqual(expected.sort());
  });

  it("finds a registered tool by name", () => {
    for (const entry of DEFINED_TOOLS) expect(findDefinedTool(entry.name)).toBe(entry);
    expect(findDefinedTool("no_such_tool")).toBeUndefined();
  });

  it("refuses two tools with the same name", () => {
    const make = () =>
      defineTool({
        name: "list_events",
        description: "Lista eventos.",
        schema: z.object({}),
        capability: () => true,
        available: () => true,
        confirm: false,
        write: false,
        summarize: () => "Listar eventos",
        run: async () => [],
      });
    expect(() => buildToolSet([make(), make()], ctx)).toThrow(/duplicate/);
  });
});

describe("tool summaries", () => {
  afterEach(() => {
    delete toolSummaries.test_tool;
  });

  it("falls back to the tool name when no summary exists", () => {
    expect(summarizeToolCall("unknown_tool", {})).toBe("unknown_tool");
  });

  it("renders the registered summary", () => {
    toolSummaries.test_tool = (input) => `Crear la nota «${(input as { title: string }).title}»`;
    expect(summarizeToolCall("test_tool", { title: "Visita de obra" })).toBe("Crear la nota «Visita de obra»");
  });

  it("falls back to the tool name when the input doesn't fit the summary", () => {
    toolSummaries.test_tool = (input) => (input as { title: { trim(): string } }).title.trim();
    expect(summarizeToolCall("test_tool", null)).toBe("test_tool");
  });

  it("summaryOf returns the same function the client map holds", () => {
    const summarize = () => "Resumen";
    toolSummaries.test_tool = summarize;
    expect(summaryOf("test_tool")).toBe(summarize);
    expect(() => summaryOf("missing_tool")).toThrow(/NOT_FOUND/);
  });
});
