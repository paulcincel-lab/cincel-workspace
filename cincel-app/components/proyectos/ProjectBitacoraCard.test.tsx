// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { HistoryEvent } from "@/lib/types/core";

const actions = vi.hoisted(() => ({
  fetchProjectHistoryAction: vi.fn(),
  addProjectCommentAction: vi.fn(),
}));

vi.mock("@/lib/actions/projects-actions", () => actions);

import { ProjectBitacoraCard } from "./ProjectBitacoraCard";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function event(overrides: Partial<HistoryEvent>): HistoryEvent {
  return {
    id: "e1",
    entity: "project",
    entityId: PROJECT_ID,
    kind: "comentario",
    actor: { id: "s1", name: "Ana López" },
    field: null,
    beforeValue: null,
    afterValue: null,
    comment: null,
    eventAt: "2026-01-01T10:00:00.000Z",
    ...overrides,
  };
}

const older = event({
  id: "e-old",
  comment: "Primer comentario",
  eventAt: "2026-01-01T10:00:00.000Z",
});
const newer = event({
  id: "e-new",
  kind: "cambio",
  actor: null,
  field: "estado",
  beforeValue: "activo",
  afterValue: "pausado",
  eventAt: "2026-02-01T10:00:00.000Z",
});

const EMPTY_TEXT = "No hay comentarios ni cambios registrados.";
const PLACEHOLDER = "Agregar un comentario...";

beforeEach(() => {
  actions.fetchProjectHistoryAction.mockReset();
  actions.addProjectCommentAction.mockReset();
});
afterEach(cleanup);

describe("ProjectBitacoraCard", () => {
  it("lists the project history newest first", async () => {
    actions.fetchProjectHistoryAction.mockResolvedValue([older, newer]);
    render(<ProjectBitacoraCard projectId={PROJECT_ID} />);

    const change = await screen.findByText("Cambió estado: activo → pausado");
    const comment = screen.getByText("Primer comentario");
    expect(
      change.compareDocumentPosition(comment) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Sistema")).toBeTruthy();
    expect(screen.getByText("Ana López")).toBeTruthy();
    expect(actions.fetchProjectHistoryAction).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("shows the empty state", async () => {
    actions.fetchProjectHistoryAction.mockResolvedValue([]);
    render(<ProjectBitacoraCard projectId={PROJECT_ID} />);
    expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
  });

  it("adds a trimmed comment, clears the input and reloads", async () => {
    actions.fetchProjectHistoryAction
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([older]);
    actions.addProjectCommentAction.mockResolvedValue(undefined);
    render(<ProjectBitacoraCard projectId={PROJECT_ID} />);
    await screen.findByText(EMPTY_TEXT);

    const input = screen.getByPlaceholderText(
      PLACEHOLDER,
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "  Primer comentario  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));

    expect(await screen.findByText("Primer comentario")).toBeTruthy();
    expect(actions.addProjectCommentAction).toHaveBeenCalledWith(
      PROJECT_ID,
      "Primer comentario",
    );
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("does not send a blank comment and explains why", async () => {
    actions.fetchProjectHistoryAction.mockResolvedValue([]);
    render(<ProjectBitacoraCard projectId={PROJECT_ID} />);
    await screen.findByText(EMPTY_TEXT);

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Escribe un comentario antes de guardarlo.",
    );
    expect(actions.addProjectCommentAction).not.toHaveBeenCalled();
  });

  it("maps a server EMPTY error and keeps the text on failure", async () => {
    actions.fetchProjectHistoryAction.mockResolvedValue([]);
    actions.addProjectCommentAction
      .mockRejectedValueOnce(new Error("EMPTY"))
      .mockRejectedValueOnce(new Error("FORBIDDEN"));
    render(<ProjectBitacoraCard projectId={PROJECT_ID} />);
    await screen.findByText(EMPTY_TEXT);

    const input = screen.getByPlaceholderText(
      PLACEHOLDER,
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Escribe un comentario antes de guardarlo.",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No se pudo guardar el comentario.",
      ),
    );
    expect(input.value).toBe("Hola");
  });
});
