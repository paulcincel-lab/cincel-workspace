// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { UIMessage } from "ai";

// useChat is replaced by a local state holder so the tests never hit the network.
const sendMessage = vi.fn();
vi.mock("@ai-sdk/react", () => ({
  useChat: (opts: { messages?: UIMessage[] }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [messages, setMessages] = useState<UIMessage[]>(opts.messages ?? []);
    return { messages, setMessages, sendMessage, status: "ready" };
  },
}));

import { AssistantChat } from "./AssistantChat";

const THREAD_KEY = "cincel.asistente.thread.v1";

function textMessage(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text }] } as UIMessage;
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("AssistantChat restored thread", () => {
  it("marks a restored thread with a Conversación anterior divider and does not jump to the end", () => {
    window.localStorage.setItem(
      THREAD_KEY,
      JSON.stringify([
        textMessage("m1", "user", "¿Qué proyectos están en riesgo?"),
        textMessage("m2", "assistant", "Ventas por mes (ejemplo)"),
      ])
    );

    render(<AssistantChat />);

    expect(screen.getByText("Conversación anterior")).toBeTruthy();
    expect(screen.getByText("Ventas por mes (ejemplo)")).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("shows no divider when there is no saved thread", () => {
    render(<AssistantChat />);

    expect(screen.queryByText("Conversación anterior")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nueva conversación" })).toBeNull();
    expect(screen.getByText("Prueba con una de estas preguntas:")).toBeTruthy();
  });

  it("Nueva conversación clears the thread and the saved copy", async () => {
    window.localStorage.setItem(
      THREAD_KEY,
      JSON.stringify([textMessage("m1", "user", "Hola"), textMessage("m2", "assistant", "Respuesta vieja")])
    );

    render(<AssistantChat />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Nueva conversación" }));
    });

    expect(screen.queryByText("Respuesta vieja")).toBeNull();
    expect(screen.queryByText("Conversación anterior")).toBeNull();
    expect(screen.getByText("Prueba con una de estas preguntas:")).toBeTruthy();
    expect(window.localStorage.getItem(THREAD_KEY)).toBeNull();
  });
});
