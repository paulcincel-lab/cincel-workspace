import { describe, expect, it } from "vitest";

import { buildAssistantChatRequestBody, pendingApprovalResponses } from "./chat-request";
import { assistantContextFromRoute, isAssistantPage } from "./page-context";
import type { UIMessage } from "ai";

const params = (entries: Record<string, string>) => new URLSearchParams(entries);

describe("assistantContextFromRoute", () => {
  it("maps /proyectos/[id] and its sub-pages to projectId", () => {
    expect(assistantContextFromRoute("/proyectos/p1")).toEqual({ route: "/proyectos/p1", projectId: "p1" });
    expect(assistantContextFromRoute("/proyectos/p1/cronograma")).toEqual({
      route: "/proyectos/p1/cronograma",
      projectId: "p1",
    });
  });

  it("maps /tareas?tarea=<id> to taskId", () => {
    expect(assistantContextFromRoute("/tareas", params({ tarea: "t9" }))).toEqual({ route: "/tareas", taskId: "t9" });
    expect(assistantContextFromRoute("/tareas", params({}))).toEqual({ route: "/tareas" });
  });

  it("maps /personas/equipo/[id] to personId", () => {
    expect(assistantContextFromRoute("/personas/equipo/s3")).toEqual({ route: "/personas/equipo/s3", personId: "s3" });
    expect(assistantContextFromRoute("/personas/equipo")).toEqual({ route: "/personas/equipo" });
  });

  it("always carries the route and nothing else on other pages", () => {
    expect(assistantContextFromRoute("/inicio")).toEqual({ route: "/inicio" });
    expect(assistantContextFromRoute("/proyectos")).toEqual({ route: "/proyectos" });
  });

  it("drops ids that are not plain identifiers", () => {
    expect(assistantContextFromRoute("/tareas", params({ tarea: "<script>" }))).toEqual({ route: "/tareas" });
  });

  it("recognizes the full assistant page", () => {
    expect(isAssistantPage("/asistente")).toBe(true);
    expect(isAssistantPage("/inicio")).toBe(false);
  });
});

describe("buildAssistantChatRequestBody", () => {
  const context = { route: "/inicio" };
  const user = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] }) as UIMessage;

  it("sends only the new user message, never the history", () => {
    const body = buildAssistantChatRequestBody({
      id: "thread-1",
      messages: [user("m1", "hola"), { id: "a1", role: "assistant", parts: [] } as UIMessage, user("m2", "otra")],
      context,
    });
    expect(body).toEqual({ id: "thread-1", message: user("m2", "otra"), context });
    expect(body).not.toHaveProperty("messages");
  });

  it("sends the approval responses after the user answers a confirmation", () => {
    const assistant = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: "Voy a crear la nota." },
        {
          type: "tool-create_note",
          toolCallId: "call-1",
          state: "approval-responded",
          input: { title: "Compras" },
          approval: { id: "ap-1", approved: true },
        },
        {
          type: "tool-create_checklist",
          toolCallId: "call-2",
          state: "approval-responded",
          input: { title: "Obra" },
          approval: { id: "ap-2", approved: false },
        },
      ],
    } as unknown as UIMessage;
    expect(pendingApprovalResponses(assistant)).toEqual([
      { toolCallId: "call-1", approved: true },
      { toolCallId: "call-2", approved: false },
    ]);
    expect(buildAssistantChatRequestBody({ id: "thread-1", messages: [user("m1", "x"), assistant], context })).toEqual({
      id: "thread-1",
      approvals: [
        { toolCallId: "call-1", approved: true },
        { toolCallId: "call-2", approved: false },
      ],
      context,
    });
  });
});
