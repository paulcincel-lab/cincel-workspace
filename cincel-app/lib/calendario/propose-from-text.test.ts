// @vitest-environment node
/**
 * Eval-style checks of `propose_from_text` (Calendario BE §11.2, #1074) with a
 * mocked provider: the two sentences of the design canvas, an unknown intent
 * and the rate limit. No live model; the model's answers are recorded calls.
 */
import { tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const state = vi.hoisted(() => ({
  model: null as unknown,
  executed: [] as { name: string; input: unknown }[],
  toolOutput: { ok: true, proposalId: "p-1" } as Record<string, unknown>,
}));

vi.mock("@/lib/assistant/provider", () => ({ getLanguageModel: () => state.model }));
vi.mock("@/lib/assistant/tools/index", () => ({
  findDefinedTool: (name: string) => ({
    name,
    definition: { capability: () => true },
    toAiTool: () =>
      tool({
        description: name,
        inputSchema: z.object({}).passthrough(),
        execute: async (input) => {
          state.executed.push({ name, input });
          return state.toolOutput;
        },
      }),
  }),
}));
vi.mock("@/lib/calendario/propose", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/calendario/propose")>()),
  loadOverdueTaskIds: vi.fn(async () => ["t-1", "t-2"]),
  proposeMoveTasks: vi.fn(async (_source: unknown, input: unknown) => {
    state.executed.push({ name: "move_tasks", input });
    return { ok: true, proposal: { id: "p-move", kind: "mover_tareas", title: "Propuesta" } };
  }),
  loadPromptTasks: vi.fn(async () => [
    { id: "t-1", title: "Revisar planos", project: "Casa Roble", date: "2026-11-05" },
    { id: "t-2", title: "Cotizar cocina", project: null, date: "2026-11-09" },
  ]),
}));
vi.mock("@/lib/repositories/proposals-repository", () => ({
  getProposal: vi.fn(async (_user: unknown, id: string) => ({ id, kind: "crear_reunion", title: "Propuesta" })),
}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

import type { ToolRunContext } from "@/lib/assistant/define-tool";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { proposeFromText, proposeRateLimiter } from "@/lib/calendario/propose-from-text";

const user: AuthenticatedUser = {
  member: { id: "11111111-1111-4111-8111-111111111111", name: "Ana Pérez", role: "Colaborador", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
  email: "ana@cincel.mx",
  access: "Colaborador",
};
const ctx: ToolRunContext = { user, context: { route: "/calendario" }, threadId: null };
// 2026-11-11 is a Wednesday; 12:00 in Ciudad de México.
const NOW = new Date("2026-11-11T18:00:00Z");
const BASE = { view: "semana" as const, from: "2026-11-09", to: "2026-11-15" };

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

function calling(toolName: string, input: unknown) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "tool-call", toolCallId: "c1", toolName, input: JSON.stringify(input) }],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
      usage,
      warnings: [],
    },
  });
}

function answering(text: string) {
  return new MockLanguageModelV4({
    doGenerate: { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: "stop" }, usage, warnings: [] },
  });
}

function systemOf(model: MockLanguageModelV4): string {
  const message = model.doGenerateCalls[0]?.prompt.find((m) => m.role === "system");
  return message && typeof message.content === "string" ? message.content : "";
}

beforeEach(() => {
  state.executed = [];
  state.toolOutput = { ok: true, proposalId: "p-1" };
  proposeRateLimiter.reset();
});

describe("propose_from_text", () => {
  it("turns «Junta con el cliente de Madrid 22 mañana a las 10» into a create_event call dated in the org zone", async () => {
    const model = calling("create_event", { title: "Junta con el cliente de Madrid 22", start: "2026-11-12T10:00", project: "Madrid 22" });
    state.model = model;
    const made = await proposeFromText(ctx, { ...BASE, text: "Junta con el cliente de Madrid 22 mañana a las 10" }, NOW);

    expect(made).toMatchObject({ ok: true, proposal: { id: "p-1" } });
    expect(state.executed).toEqual([
      { name: "create_event", input: { title: "Junta con el cliente de Madrid 22", start: "2026-11-12T10:00", project: "Madrid 22" } },
    ]);
    const call = model.doGenerateCalls[0];
    expect(call.toolChoice).toEqual({ type: "required" });
    expect((call.tools ?? []).map((t) => t.name).sort()).toEqual(["create_event", "move_tasks"]);
    expect(model.doGenerateCalls).toHaveLength(1);
    const system = systemOf(model);
    expect(system).toContain("Solo propones: nunca cambias datos");
    expect(system).toContain("Mañana es jueves 2026-11-12.");
    expect(system).toContain("vista de semana del 2026-11-09 al 2026-11-15");
  });

  it("turns «Pasa lo vencido al jueves» into a move_tasks proposal without calling the model", async () => {
    const model = calling("move_tasks", {});
    state.model = model;
    const made = await proposeFromText(ctx, { ...BASE, text: "Pasa lo vencido al jueves" }, NOW);

    expect(made).toMatchObject({ ok: true, proposal: { id: "p-move" } });
    expect(state.executed).toEqual([{ name: "move_tasks", input: { taskIds: ["t-1", "t-2"], toDate: "2026-11-12" } }]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("still lists the person's tasks in the prompt for other move requests", async () => {
    const model = calling("move_tasks", { taskIds: ["t-1"], toDate: "2026-11-12" });
    state.model = model;
    await proposeFromText(ctx, { ...BASE, text: "Cambia Revisar planos para el jueves" }, NOW);
    const system = systemOf(model);
    expect(system).toContain("t-1 · 2026-11-05 · Revisar planos · Casa Roble");
    expect(system).toContain("el jueves = 2026-11-12");
  });

  it("answers NO_INTENT with the hint when the model calls no tool", async () => {
    state.model = answering("No sé qué hacer.");
    const made = await proposeFromText(ctx, { ...BASE, text: "¿Cómo está el clima?" }, NOW);
    expect(made).toEqual({
      ok: false,
      error: "NO_INTENT",
      message: 'No entendí qué cambiar. Prueba con "Pasa lo vencido al jueves".',
    });
    expect(state.executed).toEqual([]);
  });

  it("passes on the refusal of the tool it called", async () => {
    state.model = calling("move_tasks", { taskIds: ["t-9"], toDate: "2026-11-12" });
    state.toolOutput = { ok: false, error: "NOT_FOUND", message: "No encontré esas tareas o no tienes acceso a ellas." };
    const made = await proposeFromText(ctx, { ...BASE, text: "Pasa eso al jueves" }, NOW);
    expect(made).toEqual({ ok: false, error: "NOT_FOUND", message: "No encontré esas tareas o no tienes acceso a ellas." });
  });

  it("limits the model calls to 20 per 10 minutes per person", async () => {
    for (let i = 0; i < 20; i++) {
      state.model = answering("nada");
      expect((await proposeFromText(ctx, { ...BASE, text: "hola mundo" }, NOW)).ok).toBe(false);
    }
    state.model = calling("move_tasks", { taskIds: ["t-1"], toDate: "2026-11-12" });
    const limited = await proposeFromText(ctx, { ...BASE, text: "Pasa lo vencido al jueves" }, NOW);
    expect(limited).toMatchObject({ ok: false, error: "RATE_LIMITED" });
    expect(state.executed).toEqual([]);
  });
});
