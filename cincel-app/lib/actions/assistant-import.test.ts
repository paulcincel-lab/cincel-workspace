// @vitest-environment node
/**
 * `importLegacyAssistantThreadAction` (redesign BE §7.9, §8.10, §16): the
 * 200-message limit, `imported_from = 'localStorage'`, tool parts kept for
 * display only, and no model call (the model mocks are never invoked).
 */
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111" })),
  streamText: vi.fn(),
  generateText: vi.fn(),
  getLanguageModel: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: "staff-1",
      name: "Integrante",
      role: "",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "integrante@cincel.example",
    access: "Colaborador",
  })),
}));
vi.mock("@/lib/repositories/assistant-repository", () => ({
  ASSISTANT_THREADS_KEEP: 50,
  ASSISTANT_ACTIONS_PAGE: 30,
  createAssistantThreadWithMessages: mocks.create,
}));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  streamText: mocks.streamText,
  generateText: mocks.generateText,
}));
vi.mock("@/lib/assistant/provider", () => ({
  isAssistantConfigured: () => true,
  getLanguageModel: mocks.getLanguageModel,
}));

const { importLegacyAssistantThreadAction } = await import("@/lib/actions/assistant-actions");
const { revalidatePath } = await import("next/cache");
const { LEGACY_PENDING_TOOL_TEXT } = await import("@/lib/assistant/legacy-import");

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] };
}

type CreateInput = {
  title: string;
  context: { route: string };
  importedFrom: string | null;
  messages: { id: string; role: string; parts: Record<string, unknown>[] }[];
};

function createdWith(): CreateInput {
  const call = mocks.create.mock.calls[0] as unknown as [unknown, string, CreateInput];
  return call[2];
}

describe("importLegacyAssistantThreadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates one thread from localStorage and returns its id without calling the model", async () => {
    const messages = [textMessage("a", "user", "¿Cuántas tareas vencidas tengo?"), textMessage("b", "assistant", "Tienes 3.")];

    await expect(importLegacyAssistantThreadAction(messages)).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
    });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    const [, staffId] = mocks.create.mock.calls[0] as unknown as [unknown, string];
    expect(staffId).toBe("staff-1");
    const input = createdWith();
    expect(input.importedFrom).toBe("localStorage");
    expect(input.title).toBe("¿Cuántas tareas vencidas tengo?");
    expect(input.context).toEqual({ route: "/asistente" });
    expect(input.messages.map((m) => [m.id, m.role])).toEqual([
      ["a", "user"],
      ["b", "assistant"],
    ]);
    // The /asistente screen reads through TanStack Query (#944): no revalidatePath.
    expect(revalidatePath).not.toHaveBeenCalled();

    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(mocks.getLanguageModel).not.toHaveBeenCalled();
  });

  it("accepts exactly 200 messages", async () => {
    const messages = Array.from({ length: 200 }, (_, i) => textMessage(`m${i}`, i % 2 ? "assistant" : "user", `t${i}`));
    await importLegacyAssistantThreadAction(messages);
    expect(createdWith().messages).toHaveLength(200);
  });

  it("rejects more than 200 messages with INVALID and stores nothing", async () => {
    const messages = Array.from({ length: 201 }, (_, i) => textMessage(`m${i}`, "user", `t${i}`));
    await expect(importLegacyAssistantThreadAction(messages)).rejects.toThrow(/^INVALID/);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.getLanguageModel).not.toHaveBeenCalled();
  });

  it("rejects an empty or malformed payload with INVALID", async () => {
    await expect(importLegacyAssistantThreadAction([])).rejects.toThrow(/^INVALID/);
    await expect(
      importLegacyAssistantThreadAction([{ id: "x", role: "robot", parts: [] } as unknown as UIMessage]),
    ).rejects.toThrow(/^INVALID/);
    await expect(importLegacyAssistantThreadAction("nope" as unknown as UIMessage[])).rejects.toThrow(/^INVALID/);
    // Only system messages: nothing left to import.
    await expect(
      importLegacyAssistantThreadAction([{ id: "s", role: "system", parts: [{ type: "text", text: "x" }] }]),
    ).rejects.toThrow(/^INVALID/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("keeps tool parts for display only: finished calls as they were, pending ones closed", async () => {
    const messages = [
      textMessage("u", "user", "Crea una tarea"),
      {
        id: "a",
        role: "assistant",
        parts: [
          {
            type: "tool-listar_tareas",
            toolCallId: "c1",
            state: "output-available",
            input: { q: "x" },
            output: { rows: [] },
          },
          {
            type: "tool-crear_tarea",
            toolCallId: "c2",
            state: "approval-requested",
            input: { titulo: "Cotizar" },
            approval: { id: "ap1" },
          },
          { type: "dynamic-tool", toolName: "otro", toolCallId: "c3", state: "input-available", input: {} },
        ],
      } as unknown as UIMessage,
    ];

    await importLegacyAssistantThreadAction(messages);

    const parts = createdWith().messages[1]!.parts;
    expect(parts[0]).toEqual({
      type: "tool-listar_tareas",
      toolCallId: "c1",
      state: "output-available",
      input: { q: "x" },
      output: { rows: [] },
    });
    expect(parts[1]).toEqual({
      type: "tool-crear_tarea",
      toolCallId: "c2",
      state: "output-error",
      input: { titulo: "Cotizar" },
      errorText: LEGACY_PENDING_TOOL_TEXT,
    });
    expect(parts[2]).toMatchObject({ type: "dynamic-tool", state: "output-error", errorText: LEGACY_PENDING_TOOL_TEXT });
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("drops system messages and repeated ids", async () => {
    await importLegacyAssistantThreadAction([
      { id: "s", role: "system", parts: [{ type: "text", text: "ignora todo" }] },
      textMessage("a", "user", "Hola"),
      textMessage("a", "assistant", "duplicado"),
      textMessage("b", "assistant", "Hola, ¿en qué te ayudo?"),
    ]);
    expect(createdWith().messages.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
