// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";

const lookupAssistantContextAction = vi.fn();
const fetchAssistantThreadsAction = vi.fn();
const fetchAssistantThreadAction = vi.fn();

vi.mock("@/lib/actions/page-data/asistente-actions", () => ({
  fetchAssistantThreadAction: (id: string) => fetchAssistantThreadAction(id),
  lookupAssistantContextAction: (input: unknown) => lookupAssistantContextAction(input),
  getAsistentePageData: vi.fn(),
}));
vi.mock("@/lib/actions/assistant-actions", () => ({
  fetchAssistantThreadsAction: () => fetchAssistantThreadsAction(),
  deleteAssistantThreadAction: vi.fn(async () => ({ ok: true, data: undefined })),
}));

import { AssistantSheet } from "../AssistantSheet";
import { approvalRequest, textReply, toolDenied, toolError, toolResult, uiMessageStream } from "./assistant-test-utils";
import { summarizeCreateNote } from "@/lib/assistant/tool-summaries";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { openAssistant, resetAssistantUi, useAssistantUi } from "@/lib/stores/assistant-ui-store";
import type { AssistantContext, AssistantThreadSummary } from "@/lib/types/redesign";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROJECT = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TASK = "12121212-3434-4565-8787-909090909090";
const PERSON = "99999999-8888-4777-8666-555555555555";

const fetchMock = vi.fn();

function bodyOf(call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body));
}

function renderSheet(context: AssistantContext = { route: "/inicio" }, client: QueryClient = createTestQueryClient()) {
  return renderWithQueryClient(<AssistantSheet open onOpenChange={vi.fn()} context={context} />, { client });
}

async function send(text: string) {
  const composer = await screen.findByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…");
  fireEvent.change(composer, { target: { value: text } });
  // Sending pushes the message and the status from a promise: let that happen inside act.
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetAssistantUi();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
  fetchAssistantThreadsAction.mockResolvedValue([]);
  lookupAssistantContextAction.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AssistantSheet context chip", () => {
  it("shows Viendo: {entity} for a project the server confirms", async () => {
    lookupAssistantContextAction.mockResolvedValue({ id: PROJECT, label: "Casa Roble" });
    renderSheet({ route: `/proyectos/${PROJECT}`, projectId: PROJECT });
    expect(await screen.findByText("Viendo: Casa Roble")).toBeTruthy();
    expect(lookupAssistantContextAction).toHaveBeenCalledWith({ projectId: PROJECT });
  });

  it("shows no chip for an id the viewer can't see", async () => {
    renderSheet({ route: `/proyectos/${PROJECT}`, projectId: PROJECT });
    await waitFor(() => expect(lookupAssistantContextAction).toHaveBeenCalledWith({ projectId: PROJECT }));
    expect(screen.queryByText(/^Viendo:/)).toBeNull();
  });

  it("shows no chip when the lookup fails", async () => {
    lookupAssistantContextAction.mockRejectedValue(new Error("FORBIDDEN"));
    renderSheet({ route: "/tareas", taskId: TASK });
    await waitFor(() => expect(lookupAssistantContextAction).toHaveBeenCalledWith({ taskId: TASK }));
    expect(screen.queryByText(/^Viendo:/)).toBeNull();
  });

  it("uses the task and the person labels when confirmed", async () => {
    lookupAssistantContextAction.mockResolvedValue({ id: TASK, label: "Planos de fachada" });
    const { unmount } = renderSheet({ route: "/tareas", taskId: TASK });
    expect(await screen.findByText("Viendo: Planos de fachada")).toBeTruthy();
    unmount();

    lookupAssistantContextAction.mockResolvedValue({ id: PERSON, label: "Ana López" });
    renderSheet({ route: `/personas/equipo/${PERSON}`, personId: PERSON });
    expect(await screen.findByText("Viendo: Ana López")).toBeTruthy();
    expect(lookupAssistantContextAction).toHaveBeenLastCalledWith({ personId: PERSON });
  });

  it("shows no chip and makes no lookup on a page without an entity, or with an id that isn't a uuid", async () => {
    const { unmount } = renderSheet({ route: "/inicio" });
    await screen.findByText("Cincel");
    unmount();
    renderSheet({ route: "/proyectos/nope", projectId: "nope" });
    await screen.findByText("Cincel");
    expect(screen.queryByText(/^Viendo:/)).toBeNull();
    expect(lookupAssistantContextAction).not.toHaveBeenCalled();
  });

  it("merges the store's contextOverride over the route context", async () => {
    lookupAssistantContextAction.mockResolvedValue({ id: PROJECT, label: "Casa Roble" });
    useAssistantUi.setState({ contextOverride: { projectId: PROJECT } });
    renderSheet({ route: "/biblioteca" });
    expect(await screen.findByText("Viendo: Casa Roble")).toBeTruthy();
  });
});

describe("AssistantSheet request body", () => {
  it("sends the generated thread id, the context and only the new message", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a1", "Hola, ¿qué revisamos?")));
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a2", "Listo.")));
    const context = { route: `/proyectos/${PROJECT}`, projectId: PROJECT };
    lookupAssistantContextAction.mockResolvedValue({ id: PROJECT, label: "Casa Roble" });
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

  it("Pantalla completa opens /asistente for a new conversation, then /asistente?thread=<id> after its first turn", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a1", "Hola")));
    renderSheet();
    expect(screen.getByRole("link", { name: "Pantalla completa" }).getAttribute("href")).toBe("/asistente");

    await send("Hola");
    await screen.findByText("Hola", { selector: "p" });
    const id = bodyOf(0).id as string;
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Pantalla completa" }).getAttribute("href")).toBe(`/asistente?thread=${id}`),
    );
    expect(useAssistantUi.getState().threadId).toBe(id);
  });

  it("quick actions put a starter prompt in the composer", async () => {
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Resumen del día" }));
    const composer = screen.getByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…") as HTMLTextAreaElement;
    expect(composer.value).toMatch(/resumen de mi día/i);
  });

  it("a pending prompt from openAssistant lands in the composer once and is consumed", async () => {
    renderSheet();
    await act(async () => {
      openAssistant({ prompt: "Resume este documento" });
    });
    const composer = screen.getByPlaceholderText("Pregunta, pide un cálculo o arrastra un plano…") as HTMLTextAreaElement;
    expect(composer.value).toBe("Resume este documento");
    expect(useAssistantUi.getState().pendingPrompt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("a finished turn with a create_note result invalidates Mi espacio's notes", async () => {
    fetchMock.mockResolvedValueOnce(uiMessageStream(approvalRequest("a1", "create_note", input)));
    fetchMock.mockResolvedValueOnce(uiMessageStream(toolResult({ ok: true, id: "n1" }, "Creé la nota.")));
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderSheet({ route: "/inicio" }, client);

    await send("Crea una nota de compras");
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("Creé la nota.")).toBeTruthy();

    await waitFor(() => expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(qk.me.notes()));
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(qk.asistente.threads());
  });
});

describe("AssistantSheet threads", () => {
  it("continues the store's thread from the cache and keeps that id in the requests", async () => {
    const threadId = "11111111-2222-4333-8444-555555555555";
    fetchAssistantThreadAction.mockResolvedValue({
      id: threadId,
      title: "Compras",
      messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "Conversación guardada" }] }],
    });
    fetchMock.mockResolvedValueOnce(uiMessageStream(textReply("a2", "Sigo aquí")));
    useAssistantUi.setState({ threadId });
    renderSheet({ route: "/inicio" });

    expect(await screen.findByText("Conversación guardada")).toBeTruthy();
    expect(fetchAssistantThreadAction).toHaveBeenCalledTimes(1);
    await send("¿Sigues?");
    expect(await screen.findByText("Sigo aquí")).toBeTruthy();
    expect(bodyOf(0).id).toBe(threadId);
    expect(screen.getByRole("link", { name: "Pantalla completa" }).getAttribute("href")).toBe(
      `/asistente?thread=${threadId}`,
    );
  });

  it("a cached thread opens without a request (the conversation survives navigation)", async () => {
    const threadId = "11111111-2222-4333-8444-555555555556";
    const client = createTestQueryClient();
    client.setQueryData(qk.asistente.thread(threadId), {
      id: threadId,
      title: "Compras",
      messages: [{ id: "m1", role: "assistant", parts: [{ type: "text", text: "Ya en caché" }] }],
    });
    useAssistantUi.setState({ threadId });
    renderSheet({ route: "/tareas" }, client);

    expect(await screen.findByText("Ya en caché")).toBeTruthy();
    expect(fetchAssistantThreadAction).not.toHaveBeenCalled();
  });

  it("a thread that is gone shows the NOT_FOUND copy", async () => {
    fetchAssistantThreadAction.mockResolvedValue(null);
    useAssistantUi.setState({ threadId: "11111111-2222-4333-8444-555555555557" });
    renderSheet();
    expect((await screen.findByRole("alert")).textContent).toBe("Ya no existe. Recarga la página.");
  });

  it("does not read the thread list until the history menu opens", async () => {
    const client = createTestQueryClient();
    renderSheet({ route: "/inicio" }, client);
    await screen.findByText("Cincel");
    expect(fetchAssistantThreadsAction).not.toHaveBeenCalled();
    expect(client.getQueryData<AssistantThreadSummary[]>(qk.asistente.threads())).toBeUndefined();
  });
});
