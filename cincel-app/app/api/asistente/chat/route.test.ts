import { describe, expect, it, vi, beforeEach } from "vitest";

const { getSessionMock, requireCapabilityUserMock, streamTextMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  requireCapabilityUserMock: vi.fn(),
  streamTextMock: vi.fn(),
}));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
  requireCapabilityUser: requireCapabilityUserMock,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: streamTextMock,
    convertToModelMessages: (m: unknown) => m,
    stepCountIs: (n: number) => n,
  };
});

vi.mock("@/lib/assistant/provider", () => ({
  getLanguageModel: () => "model",
  isAssistantConfigured: () => process.env.LLM_BASE_URL != null && process.env.LLM_API_KEY != null,
}));

import { POST } from "./route";
import { ASSISTANT_TOOLS } from "@/lib/assistant/tools";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

function userWithAccess(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id: 1,
      name: "Test",
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "test@cincel.mx",
      phone: "",
    },
    email: "test@cincel.mx",
    access,
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/asistente/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSessionMock.mockReset();
  requireCapabilityUserMock.mockReset();
  requireCapabilityUserMock.mockResolvedValue(userWithAccess("Administrador"));
  streamTextMock.mockReset();
  streamTextMock.mockReturnValue({
    toUIMessageStreamResponse: () => new Response("stream"),
  });
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_API_KEY;
});

describe("POST /api/asistente/chat", () => {
  it("401 without a session", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(req({ messages: [] }) as never);
    expect(res.status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("503 when the assistant is not configured", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    const res = await POST(req({ messages: [] }) as never);
    expect(res.status).toBe(503);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("403 when the session has no system access", async () => {
    process.env.LLM_BASE_URL = "http://llm";
    process.env.LLM_API_KEY = "k";
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    requireCapabilityUserMock.mockRejectedValue(new Error("FORBIDDEN"));

    const res = await POST(req({ messages: [] }) as never);
    expect(res.status).toBe(403);
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  it("gives an Administrador the read tools plus the write tools", async () => {
    process.env.LLM_BASE_URL = "http://llm";
    process.env.LLM_API_KEY = "k";
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    requireCapabilityUserMock.mockResolvedValue(userWithAccess("Administrador"));

    await POST(req({ messages: [{ role: "user", parts: [] }] }) as never);

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const arg = streamTextMock.mock.calls[0][0];
    expect(Object.keys(arg.tools).sort()).toEqual(
      [
        ...Object.keys(ASSISTANT_TOOLS),
        "create_task",
        "assign_task",
        "create_client",
        "onboard_client",
        "find_duplicates",
        "merge_duplicate_clients",
        "merge_duplicate_activities",
      ].sort()
    );
    expect(arg.stopWhen).toBe(5);
  });

  it("withholds assign_task from a Colaborador", async () => {
    process.env.LLM_BASE_URL = "http://llm";
    process.env.LLM_API_KEY = "k";
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });
    requireCapabilityUserMock.mockResolvedValue(userWithAccess("Colaborador"));

    await POST(req({ messages: [{ role: "user", parts: [] }] }) as never);

    const arg = streamTextMock.mock.calls[0][0];
    const keys = Object.keys(arg.tools);
    expect(keys).toContain("create_task");
    expect(keys).not.toContain("assign_task");
  });
});
