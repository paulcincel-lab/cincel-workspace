// @vitest-environment node
import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import {
  formatStepDuration,
  RENDER_WIDGET_TOOLS,
  TOOL_STEP_DEFS,
  toolStepGroupsOf,
  toToolSteps,
  type ToolStepState,
} from "@/lib/assistant/tool-steps";
import { buildAssistantTools } from "@/lib/assistant/tools";
import { DEFINED_TOOLS } from "@/lib/assistant/tools/index";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

type Parts = UIMessage["parts"];

function tool(state: string, extra: Record<string, unknown> = {}, name = "list_my_tasks", id = "c1") {
  return { type: `tool-${name}`, toolCallId: id, state, input: { due: "vencidas" }, ...extra };
}

function stepOf(part: Record<string, unknown>) {
  const [group] = toolStepGroupsOf([part] as unknown as Parts);
  return group!.steps[0]!;
}

const admin = {
  member: {
    id: "1",
    name: "Ana",
    role: "Administrador",
    area: "",
    capacity: 0,
    availability: "",
    active: true,
    institutionalEmail: "ana@cincel.mx",
    phone: "",
  },
  email: "ana@cincel.mx",
  access: "Administrador",
} as AuthenticatedUser;

describe("toToolSteps", () => {
  it("maps every part state to its step state", () => {
    const cases: [Record<string, unknown>, ToolStepState][] = [
      [tool("input-streaming"), "running"],
      [tool("input-available"), "running"],
      [tool("output-available", { output: { tasks: [] }, preliminary: true }), "running"],
      [tool("approval-requested", { approval: { id: "a1" } }), "needs-confirmation"],
      [tool("approval-responded", { approval: { id: "a1", approved: true } }), "confirmed"],
      [tool("approval-responded", { approval: { id: "a1", approved: false } }), "denied"],
      [tool("output-denied", { approval: { id: "a1", approved: false } }), "denied"],
      [tool("output-available", { output: { ok: false, error: "NOT_FOUND", message: "No encontré el proyecto." } }), "error"],
      [tool("output-error", { errorText: "FORBIDDEN: no" }), "error"],
      [tool("output-available", { output: { tasks: [] } }), "done"],
    ];
    for (const [part, state] of cases) {
      expect(stepOf(part).state, String(part.state)).toBe(state);
    }
    expect(stepOf(tool("output-error", { errorText: "FORBIDDEN: no" })).errorText).toBe(
      "No tienes permiso para realizar esta acción.",
    );
  });

  it("ToolFailure output is an error", () => {
    const step = stepOf(tool("output-available", { output: { ok: false, error: "NOT_FOUND", message: "No encontré el proyecto." } }));
    expect(step.state).toBe("error");
    expect(step.errorText).toBe("No encontré el proyecto.");
    expect(step.rows).toBeNull();
    // An untrusted wrapper is unwrapped first.
    const wrapped = stepOf(
      tool("output-available", { output: { untrusted: true, content: { ok: false, error: "FORBIDDEN", message: "" } } }),
    );
    expect(wrapped.state).toBe("error");
    expect(wrapped.errorText).toBe("No tienes permiso para realizar esta acción.");
  });

  it("every registered tool has a step def", () => {
    const names = new Set([...DEFINED_TOOLS.map((entry) => entry.name), ...Object.keys(buildAssistantTools(admin))]);
    expect(names.size).toBeGreaterThan(20);
    const missing = [...names].filter((name) => !TOOL_STEP_DEFS[name]);
    expect(missing).toEqual([]);
    for (const name of names) {
      const def = TOOL_STEP_DEFS[name]!;
      expect(def.running.endsWith("…"), name).toBe(true);
      expect(def.short.length, name).toBeGreaterThan(0);
    }
  });

  it("unknown tool falls back to its name", () => {
    const step = stepOf({
      type: "tool-herramienta_nueva",
      toolCallId: "x1",
      state: "output-available",
      input: { proyecto: "Oficina Polanco", limite: 5 },
      output: { ok: true },
    });
    expect(step.label).toBe("herramienta_nueva");
    expect(step.short).toBe("herramienta_nueva");
    expect(step.params).toEqual([
      { key: "proyecto", value: "Oficina Polanco" },
      { key: "limite", value: "5" },
    ]);
    const dynamic = stepOf({ type: "dynamic-tool", toolName: "buscar", toolCallId: "x2", state: "input-available", input: {} });
    expect(dynamic.toolName).toBe("buscar");
  });

  it("groups consecutive same-tool approvals only", () => {
    const approval = (id: string, name: string) => ({
      type: `tool-${name}`,
      toolCallId: id,
      state: "approval-requested",
      input: { description: `Revisión ${id}`, project: "Oficina Polanco", workflow: "diseno", commitmentDate: "2026-11-13" },
      approval: { id: `ap-${id}` },
    });
    const parts = [
      { type: "step-start" },
      tool("output-available", { output: { tasks: [] } }, "list_my_tasks", "r1"),
      approval("1", "create_task"),
      approval("2", "create_task"),
      approval("3", "create_event"),
      approval("4", "create_task"),
      { type: "text", text: "¿Confirmas?" },
      approval("5", "create_task"),
      { type: "tool-render_chart", toolCallId: "w1", state: "output-available", input: {}, output: {} },
      approval("6", "create_task"),
    ] as unknown as Parts;

    const groups = toolStepGroupsOf(parts);
    expect(groups.map((g) => [g.kind, g.steps.map((s) => s.toolCallId)])).toEqual([
      ["steps", ["r1"]],
      ["approval", ["1", "2"]],
      ["approval", ["3"]],
      ["approval", ["4"]],
      // A widget part between two approvals doesn't split them; text does.
      ["approval", ["5", "6"]],
    ]);
    const first = groups[1]!;
    expect(first.kind === "approval" && first.preview).toEqual([
      { op: "+", title: "Revisión 1", etapa: { key: "diseno", name: "Diseño", sortOrder: 2 }, date: "vie 13 nov" },
      { op: "+", title: "Revisión 2", etapa: { key: "diseno", name: "Diseño", sortOrder: 2 }, date: "vie 13 nov" },
    ]);
    expect(first.steps.map((s) => s.approvalId)).toEqual(["ap-1", "ap-2"]);
  });

  it("skips widget tools and reads durations from the message metadata", () => {
    const message: UIMessage = {
      id: "m1",
      role: "assistant",
      metadata: { toolMs: { c1: 640 } },
      parts: [
        tool("output-available", { output: { tasks: [{ title: "A", commitmentDate: null }] } }),
        { type: "tool-render_chart", toolCallId: "w1", state: "output-available", input: {}, output: {} },
      ] as unknown as Parts,
    };
    const [group] = toToolSteps(message);
    expect(group).toMatchObject({ kind: "steps", totalMs: 640 });
    expect(group!.steps).toHaveLength(1);
    expect(group!.steps[0]).toMatchObject({ durationMs: 640, rows: 1, href: "/tareas", label: "Buscó tus tareas vencidas" });
    expect(RENDER_WIDGET_TOOLS.has("render_chart")).toBe(true);
  });

  it("formats durations", () => {
    expect(formatStepDuration(null)).toBe("—");
    expect(formatStepDuration(40)).toBe("<0.1 s");
    expect(formatStepDuration(640)).toBe("0.6 s");
    expect(formatStepDuration(1400)).toBe("1.4 s");
  });
});
