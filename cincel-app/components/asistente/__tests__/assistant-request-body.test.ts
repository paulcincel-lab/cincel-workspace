/**
 * Security (Query Migration Phase 10, #944, plan §4.8 rule 6): the chat
 * request body carries no profile or PII fields — only the thread id, the
 * new message or the approvals, and the page context ids.
 */
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";

import { buildAssistantChatRequestBody } from "@/lib/assistant/chat-request";
import type { AssistantContext } from "@/lib/types/redesign";

const BODY_KEYS = ["approvals", "context", "id", "message"];
const CONTEXT_KEYS = ["personId", "projectId", "route", "taskId"];

const user: UIMessage = { id: "m1", role: "user", parts: [{ type: "text", text: "Hola" }] };

describe("assistant chat request body", () => {
  it("has only id, message and context for a new message", () => {
    const body = buildAssistantChatRequestBody({ id: "t1", messages: [user], context: { route: "/inicio" } });
    expect(Object.keys(body).sort()).toEqual(["context", "id", "message"]);
  });

  it("has only id, approvals and context for an approval answer", () => {
    const assistant = { id: "a1", role: "assistant", parts: [] } as UIMessage;
    const body = buildAssistantChatRequestBody({ id: "t1", messages: [user, assistant], context: { route: "/" } });
    expect(Object.keys(body).sort()).toEqual(["approvals", "context", "id"]);
  });

  it("drops anything but the route and the entity ids from the context", () => {
    const context = {
      route: "/personas/equipo/s1",
      personId: "s1",
      projectId: "p1",
      taskId: "t1",
      email: "ana@cincel.mx",
      phone: "555",
      profile: { birthday: "1990-01-01" },
      name: "Ana López",
    } as unknown as AssistantContext;
    const body = buildAssistantChatRequestBody({ id: "t1", messages: [user], context });
    for (const key of Object.keys(body)) expect(BODY_KEYS).toContain(key);
    expect(Object.keys(body.context).sort()).toEqual(CONTEXT_KEYS);
    expect(JSON.stringify(body)).not.toMatch(/ana@cincel\.mx|555|birthday|Ana López/);
  });
});
