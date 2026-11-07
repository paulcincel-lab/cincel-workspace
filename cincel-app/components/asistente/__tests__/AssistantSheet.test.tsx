// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const fetchProjectAction = vi.fn();
const fetchTaskAction = vi.fn();
const fetchStaffDetailAction = vi.fn();
const fetchAssistantThreadsAction = vi.fn();
const fetchAssistantThreadAction = vi.fn();

vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectAction: (id: string) => fetchProjectAction(id) }));
vi.mock("@/lib/actions/tasks-actions", () => ({ fetchTaskAction: (id: string) => fetchTaskAction(id) }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffDetailAction: (id: string) => fetchStaffDetailAction(id) }));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: () => fetchAssistantThreadsAction(),
  fetchAssistantThreadAction: (id: string) => fetchAssistantThreadAction(id),
}));

import { AssistantSheet } from "../AssistantSheet";
import { approvalRequest, textReply, toolDenied, toolError, toolResult, uiMessageStream } from "./assistant-test-utils";
import { summarizeCreateNote } from "@/lib/assistant/tool-summaries";
import type { AssistantContext } from "@/lib/types/redesign";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fetchMock = vi.fn();

function bodyOf(call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}

function renderSheet(context: AssistantContext = { route: "/inicio" }, threadId?: string) {
  return render(<AssistantSheet open onOpenChange={vi.fn()} context={context} threadId={threadId} />);
}

async function send(text: string) {
  const composer = await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…");
  fireEvent.change(composer, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
  fetchAssistantThreadsAction.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSheet context chip", () => {
  it("shows Viendo: {entity} for a project the server confirms", async () => {
    fetchProjectAction.mockResolvedValue({ id: "p1", name: "Casa Roble" });
    renderSheet({ route: "/proyectos/p1", projectId: "p1" });
    expect(await screen.findByText("Viendo: Casa Roble")).toBeTruthy();
    expect(fetchProjectAction).toHaveBeenCalledWith("p1");
  });

  it("shows no chip for an id the viewer can't see", async () => {
    fetchProjectAction.mockResolvedValue(null);
    renderSheet({ route: "/proyectos/nope", projectId: "nope" });
    await waitFor(() => expect(fetchProjectAction).toHaveBeenCalledWith("nope"));
    expect(screen.queryByText(/^Viendo:/)).toBeNull();
  });

  it("shows no chip when the read fails", async () => {
    fetchTaskAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderSheet({ route: "/tareas", taskId: "t1" });
    await waitFor(() => expect(fetchTaskAction).toHaveBeenCalledWith("t1"));
    expect(screen.queryByText(/^Viendo:/)).toBeNull();
  });

  it("uses the task and the person names when confirmed", async () => {
    fetchTaskAction.mockResolvedValue({ id: "t1", title: "Planos de fachada" });
    const { unmount } = renderSheet({ route: "/tareas", taskId: "t1" });
    expect(await screen.findByText("Viendo: Planos de fachada")).toBeTruthy();
    unmount();

    fetchStaffDetailAction.mockResolvedValue({ id: "s1", name: "Ana", lastName: "López" });
    renderSheet({ route: "/personas/equipo/s1", personId: "s1" });
    expect(await screen.findByText("Viendo: Ana López")).toBeTruthy();
  });

  it("shows no chip on a page without an entity", async () => {
    renderSheet({ route: "/inicio" });
    await screen.findByText("Cincel");
    expect(screen.queryByText(/^Viendo:/)).toBeNull();
    expect(fetchProjectAction).not.toHaveBeenCalled();
  });
});

describe("AssistantSheet request body", () => {
  it("sends the generated thread id, the context and only the new message", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a1", "Hola, ¿qué revisamos?")));
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a2", "Listo.")));
    const context = { route: "/proyectos/p1", projectId: "p1" };
    fetchProjectAction.mockResolvedValue({ id: "p1", name: "Casa Roble" });
    renderSheet(context);

    await send("Resume el proyecto");
    expect(await screen.findByText("Hola, ¿qué revisamos?")).toBeTruthy();

    const first = bodyOf(0);
    expect(first.id).toMatch(UUID);
    expect(first.context).toEqual(context);
    expect(first).not.toHaveProperty("messages");
    expect((first.message as { role: string; parts: { text: string }[] }).role).toBe("user");
    expect((first.message as { parts: { text: string }[] }).parts[0].text).toBe("Resume el proyecto");

    await send("¿Y las entregas?");
    expect(await screen.findByText("Listo.")).toBeTruthy();
    const second = bodyOf(1);
    expect(second.id).toBe(first.id);
    expect(second).not.toHaveProperty("messages");
    expect((second.message as { parts: { text: string }[] }).parts[0].text).toBe("¿Y las entregas?");
  });

  it("Pantalla completa opens /asistente?thread=<id> with the same id", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a1", "Hola")));
    renderSheet();
    await send("Hola");
    await screen.findByText("Hola", { selector: "p" });
    const id = bodyOf(0).id as string;
    const link = screen.getByRole("link", { name: "Pantalla completa" });
    expect(link.getAttribute("href")).toBe(`/asistente?thread=${id}`);
  });

  it("quick actions put a starter prompt in the composer", async () => {
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Resumen del día" }));
    const composer = screen.getByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…") as HTMLTextAreaElement;
    expect(composer.value).toMatch(/resumen de mi día/i);
  });
});

describe("AssistantSheet confirmations", () => {
  const input = { title: "Compras de obra" };

  it("Confirmar sends the approval, then shows Hecho and the model continues", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(approvalRequest("a1", "create_note", input)));
    fetchMock.mockResolvedValueOnce(uiMessageStream(toolResult({ id: "n1" }, "Creé la nota.")));
    renderSheet();

    await send("Crea una nota de compras");
    expect(await screen.findByText(summarizeCreateNote(input))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Hecho")).toBeTruthy();
    expect(await screen.findByText("Creé la nota.")).toBeTruthy();
    const second = bodyOf(1);
    expect(second.id).toBe(bodyOf(0).id);
    expect(second.approvals).toEqual([{ toolCallId: "call-1", approved: true }]);
    expect(second).not.toHaveProperty("message");
    expect(second).not.toHaveProperty("messages");
  });

  it("Cancelar sends the denial and shows Cancelado", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(approvalRequest("a1", "create_note", input)));
    fetchMock.mockResolvedValueOnce(uiMessageStream(toolDenied("De acuerdo, no la creo.")));
    renderSheet();

    await send("Crea una nota de compras");
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(await screen.findByText("Cancelado")).toBeTruthy();
    expect(bodyOf(1).approvals).toEqual([{ toolCallId: "call-1", approved: false }]);
  });

  it("an output error shows the actionErrorText copy", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(approvalRequest("a1", "create_note", input)));
    fetchMock.mockResolvedValueOnce(uiMessageStream(toolError("FORBIDDEN")));
    renderSheet();

    await send("Crea una nota de compras");
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    expect((await screen.findByRole("alert")).textContent).toBe("No tienes permiso para realizar esta acción.");
  });
});

describe("AssistantSheet threads", () => {
  it("loads a thread handed in by id and keeps that id in the requests", async () => {
    const threadId = "11111111-2222-4333-8444-555555555555";
    fetchAssistantThreadAction.mockResolvedValue({
      thread: { id: threadId, title: "Compras", context: { route: "/inicio" }, updatedAt: "2026-11-01T10:00:00Z" },
      messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "Conversación guardada" }] }],
    });
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a2", "Sigo aquí")));
    renderSheet({ route: "/inicio" }, threadId);

    expect(await screen.findByText("Conversación guardada")).toBeTruthy();
    await send("¿Sigues?");
    expect(await screen.findByText("Sigo aquí")).toBeTruthy();
    expect(bodyOf(0).id).toBe(threadId);
  });
});
