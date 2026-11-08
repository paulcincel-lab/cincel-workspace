// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import type { HistoryEvent } from "@/lib/types/core";

const actions = vi.hoisted(() => ({ addProjectCommentAction: vi.fn() }));
const pageData = vi.hoisted(() => ({ getProyectoHistoryPage: vi.fn(), getProyectoFichaData: vi.fn() }));

vi.mock("@/lib/actions/projects-actions", () => actions);
vi.mock("@/lib/actions/page-data/proyectos-actions", () => pageData);

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";

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

const page = (events: HistoryEvent[], nextCursor: string | null = null) => ({ events, nextCursor });

function renderCard() {
  const client = createTestQueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  renderWithQueryClient(<ProjectBitacoraCard projectId={PROJECT_ID} />, { client });
  return { client, invalidated: () => invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown }).queryKey) };
}

beforeEach(() => {
  pageData.getProyectoHistoryPage.mockReset();
  actions.addProjectCommentAction.mockReset();
});
afterEach(cleanup);

describe("ProjectBitacoraCard", () => {
  it("lists the project history newest first from qk.proyectos.history(id)", async () => {
    pageData.getProyectoHistoryPage.mockResolvedValue(page([older, newer]));
    renderCard();

    const change = await screen.findByText("Cambió estado: activo → pausado");
    const comment = screen.getByText("Primer comentario");
    expect(change.compareDocumentPosition(comment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Sistema")).toBeTruthy();
    expect(screen.getByText("Ana López")).toBeTruthy();
    expect(pageData.getProyectoHistoryPage).toHaveBeenCalledWith({ id: PROJECT_ID, cursor: null });
  });

  it("renders a hydrated history with no call", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.history(PROJECT_ID), { pages: [page([older])], pageParams: [null] });
    renderWithQueryClient(<ProjectBitacoraCard projectId={PROJECT_ID} />, { client });
    expect(screen.getByText("Primer comentario")).toBeTruthy();
    expect(pageData.getProyectoHistoryPage).not.toHaveBeenCalled();
  });

  it("is bounded: Ver más loads the next page after the cursor", async () => {
    pageData.getProyectoHistoryPage
      .mockResolvedValueOnce(page([newer], "e-new"))
      .mockResolvedValueOnce(page([older]));
    renderCard();

    await screen.findByText("Cambió estado: activo → pausado");
    expect(screen.queryByText("Primer comentario")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));

    expect(await screen.findByText("Primer comentario")).toBeTruthy();
    expect(pageData.getProyectoHistoryPage).toHaveBeenLastCalledWith({ id: PROJECT_ID, cursor: "e-new" });
    expect(screen.queryByRole("button", { name: "Ver más" })).toBeNull();
  });

  it("shows the empty state", async () => {
    pageData.getProyectoHistoryPage.mockResolvedValue(page([]));
    renderCard();
    expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
  });

  it("adds a trimmed comment, clears the input and invalidates only the history", async () => {
    pageData.getProyectoHistoryPage.mockResolvedValueOnce(page([])).mockResolvedValue(page([older]));
    actions.addProjectCommentAction.mockResolvedValue({ ok: true, data: undefined });
    const { invalidated } = renderCard();
    await screen.findByText(EMPTY_TEXT);

    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "  Primer comentario  " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));

    expect(await screen.findByText("Primer comentario")).toBeTruthy();
    expect(actions.addProjectCommentAction).toHaveBeenCalledWith(PROJECT_ID, "Primer comentario");
    expect(invalidated()).toEqual([qk.proyectos.history(PROJECT_ID)]);
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("does not send a blank comment and explains why", async () => {
    pageData.getProyectoHistoryPage.mockResolvedValue(page([]));
    renderCard();
    await screen.findByText(EMPTY_TEXT);

    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Escribe un comentario antes de guardarlo.");
    expect(actions.addProjectCommentAction).not.toHaveBeenCalled();
  });

  it("maps a server EMPTY result and keeps the text on failure", async () => {
    pageData.getProyectoHistoryPage.mockResolvedValue(page([]));
    actions.addProjectCommentAction
      .mockResolvedValueOnce({ ok: false, error: "EMPTY" })
      .mockResolvedValueOnce({ ok: false, error: "FORBIDDEN" });
    renderCard();
    await screen.findByText(EMPTY_TEXT);

    const input = screen.getByPlaceholderText(PLACEHOLDER) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Escribe un comentario antes de guardarlo."),
    );

    fireEvent.click(screen.getByRole("button", { name: "Guardar comentario" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No se pudo guardar el comentario."));
    expect(input.value).toBe("Hola");
  });
});
