// @vitest-environment node
/**
 * Guards of #1055: every tool the Asistente names (starter prompts,
 * suggestion cards, command list, system prompt) is registered and offered
 * only to the roles that have it, and every write tool has a step, a summary
 * and an invalidation entry.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import { LEGACY_CONFIRM_TOOLS } from "@/lib/assistant/approvals";
import { buildSystemPrompt, PROMPT_STATIC_TEXTS, toolCatalogOf } from "@/lib/assistant/prompt";
import { ASSISTANT_TOOL_GROUPS, groupsForTools } from "@/lib/assistant/starter-prompts";
import { EXAMPLES, pickSuggestions } from "@/lib/assistant/suggestions";
import { TOOL_INVALIDATIONS, WRITES_WITHOUT_LOCAL_CACHE } from "@/lib/assistant/tool-invalidation";
import { TOOL_STEP_DEFS } from "@/lib/assistant/tool-steps";
import { toolSummaries } from "@/lib/assistant/tool-summaries";
import { buildAssistantTools } from "@/lib/assistant/tools";
import { DEFINED_TOOLS } from "@/lib/assistant/tools/index";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";

function userWith(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id: "1",
      name: "Ana",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "ana@cincel.mx",
      phone: "",
    },
    email: "ana@cincel.mx",
    access,
  };
}

const RUN = { context: { route: "/asistente" }, threadId: "t1" };

/** The tool names one role gets on `/asistente` (Gmail not connected in tests). */
function namesFor(access: SystemAccessRole): Set<string> {
  return new Set(Object.keys(buildAssistantTools(userWith(access), RUN)));
}

// create_ticket is only built while SOPORTE_GITHUB_ENABLED is on, but the fixed prompt text names it.
const REGISTRY = new Set(["create_ticket", ...DEFINED_TOOLS.map((entry) => entry.name), ...Object.keys(buildAssistantTools(userWith("Administrador")))]);

const WRITE_TOOLS = [
  ...DEFINED_TOOLS.filter((entry) => entry.definition.write).map((entry) => entry.name),
  ...LEGACY_CONFIRM_TOOLS,
];

/** snake_case words with at least one underscore: candidate tool names in a text. */
function snakeNames(text: string): string[] {
  return [...new Set(text.match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g) ?? [])];
}

describe("tools named by the Asistente exist in the registry", () => {
  it("starter prompts and the command list", () => {
    const named = ASSISTANT_TOOL_GROUPS.flatMap((group) => group.prompts.flatMap((starter) => starter.tools));
    expect(named.length).toBeGreaterThan(20);
    expect(named.filter((name) => !REGISTRY.has(name))).toEqual([]);
    for (const group of ASSISTANT_TOOL_GROUPS) {
      for (const starter of group.prompts) expect(starter.tools.length, starter.label).toBeGreaterThan(0);
    }
  });

  it("example questions and suggestion cards, for every role", () => {
    for (const access of SYSTEM_ACCESS_ROLES) {
      const names = namesFor(access);
      for (const example of EXAMPLES) {
        expect(example.tools.filter((name) => !names.has(name)), `${access}: ${example.text}`).toEqual([]);
      }
    }
  });

  it("the fixed texts of the system prompt", () => {
    const named = PROMPT_STATIC_TEXTS.flatMap(snakeNames);
    expect(named).toContain("discard_project");
    expect(named.filter((name) => !REGISTRY.has(name))).toEqual([]);
  });

  it("the generated tool list of the prompt, for every role", () => {
    for (const access of SYSTEM_ACCESS_ROLES) {
      const tools = buildAssistantTools(userWith(access), RUN);
      const prompt = buildSystemPrompt({ tools: toolCatalogOf(tools, new Set(WRITE_TOOLS)), user: userWith(access) });
      const listed = [...prompt.matchAll(/^- ([a-z][a-z0-9_]*): /gm)].map((m) => m[1]);
      expect(listed.length, access).toBeGreaterThan(10);
      expect(listed.filter((name) => !(name in tools)), access).toEqual([]);
      for (const name of snakeNames(prompt).filter((n) => REGISTRY.has(n))) {
        expect(name in tools, `${access} prompt names ${name}`).toBe(true);
      }
    }
  });

  it("every registered tool has a Spanish description", () => {
    const admin = buildAssistantTools(userWith("Administrador"), RUN);
    for (const entry of DEFINED_TOOLS) expect(entry.definition.description.length, entry.name).toBeGreaterThan(20);
    for (const [name, tool] of Object.entries(admin)) expect(String(tool.description ?? "").length, name).toBeGreaterThan(20);
  });
});

describe("starters only offer tools the role can run", () => {
  it("every shown prompt's tools are in that role's tool set", () => {
    for (const access of SYSTEM_ACCESS_ROLES) {
      const names = namesFor(access);
      for (const group of groupsForTools(names)) {
        if (group.disabled) continue;
        for (const starter of group.prompts) {
          expect(starter.tools.filter((name) => !names.has(name)), `${access}: ${starter.label}`).toEqual([]);
        }
      }
      const suggestions = pickSuggestions({ hasProject: true }, groupsForTools(names));
      expect(suggestions).toHaveLength(3);
    }
  });

  it("a Colaborador doesn't get the lead-only starters; an Administrador does", () => {
    const labels = (access: SystemAccessRole) =>
      groupsForTools(namesFor(access)).flatMap((group) => group.prompts.map((starter) => starter.label));
    const lead = ["Equilibrar carga", "Reprogramar tarea", "Costo por m²", "Pedir cotizaciones", "Cronograma desde plantilla"];
    for (const label of lead) {
      expect(labels("Administrador")).toContain(label);
      expect(labels("Colaborador")).not.toContain(label);
    }
    expect(labels("Colaborador")).toContain("Mis tareas");
  });

  it("hides the mail starters without a connected Gmail and keeps the disabled Cutto group", () => {
    const groups = groupsForTools(namesFor("Administrador"));
    expect(groups.find((group) => group.key === "correo")).toBeUndefined();
    expect(groups.find((group) => group.key === "cutto")?.disabled).toBe(true);
    const withMail = groupsForTools([...namesFor("Administrador"), "search_email", "summarize_email_thread"]);
    expect(withMail.find((group) => group.key === "correo")?.prompts).toHaveLength(2);
  });
});

describe("write tools are wired", () => {
  it("every write tool has a step, a summary and an invalidation entry", () => {
    expect(WRITE_TOOLS.length).toBeGreaterThan(30);
    expect(WRITE_TOOLS.filter((name) => !TOOL_STEP_DEFS[name])).toEqual([]);
    expect(WRITE_TOOLS.filter((name) => !toolSummaries[name])).toEqual([]);
    expect(WRITE_TOOLS.filter((name) => !TOOL_INVALIDATIONS[name] && !WRITES_WITHOUT_LOCAL_CACHE[name])).toEqual([]);
  });

  it("the invalidation map names only registered write tools", () => {
    const writes = new Set(WRITE_TOOLS);
    const listed = [...Object.keys(TOOL_INVALIDATIONS), ...Object.keys(WRITES_WITHOUT_LOCAL_CACHE)];
    expect(listed.filter((name) => !writes.has(name))).toEqual([]);
    expect(Object.keys(TOOL_INVALIDATIONS).filter((name) => WRITES_WITHOUT_LOCAL_CACHE[name])).toEqual([]);
  });
});
