import { describe, expect, it, vi, beforeEach } from "vitest";

const { getSessionMock, streamTextMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  streamTextMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
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

function req(body: unknown): Request {
  return new Request("http://localhost/api/asistente/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getSessionMock.mockReset();
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

  it("streams with exactly the assistant tool set when configured", async () => {
    process.env.LLM_BASE_URL = "http://llm";
    process.env.LLM_API_KEY = "k";
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });

    await POST(req({ messages: [{ role: "user", parts: [] }] }) as never);

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    const arg = streamTextMock.mock.calls[0][0];
    expect(Object.keys(arg.tools).sort()).toEqual(Object.keys(ASSISTANT_TOOLS).sort());
    expect(arg.stopWhen).toBe(5);
  });
});
