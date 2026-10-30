// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { HistoryEvent } from "@/lib/types/core";

import { HistoryCommentInput } from "./HistoryCommentInput";
import { HistoryEventList } from "./HistoryEventList";

afterEach(cleanup);

const comment: HistoryEvent = {
  id: "e1",
  entity: "task",
  entityId: "t1",
  kind: "comentario",
  actor: { id: "s1", name: "Ana López" },
  field: null,
  beforeValue: null,
  afterValue: null,
  comment: "Revisar planos",
  eventAt: "2026-03-05T10:00:00.000Z",
};

describe("HistoryEventList", () => {
  it("renders date, author and text in the given order", () => {
    const change: HistoryEvent = {
      ...comment,
      id: "e2",
      kind: "cambio",
      actor: null,
      field: "estado",
      afterValue: "listo",
      comment: null,
    };
    render(
      <HistoryEventList events={[change, comment]} empty={<p>Vacío</p>} />,
    );
    const first = screen.getByText("Cambió estado: — → listo");
    const second = screen.getByText("Revisar planos");
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("Sistema")).toBeTruthy();
    expect(screen.getAllByText("05-03-2026")).toHaveLength(2);
    expect(screen.queryByText("Vacío")).toBeNull();
  });

  it("renders the empty node when there are no events", () => {
    render(<HistoryEventList events={[]} empty={<p>Vacío</p>} />);
    expect(screen.getByText("Vacío")).toBeTruthy();
  });
});

describe("HistoryCommentInput", () => {
  it("submits trimmed text, clears it, and ignores blank text", async () => {
    const onSubmit = vi.fn();
    const onEmpty = vi.fn();
    render(
      <HistoryCommentInput
        onSubmit={onSubmit}
        onEmpty={onEmpty}
        placeholder="Nota"
        submitLabel="Guardar"
      />,
    );
    const input = screen.getByPlaceholderText("Nota") as HTMLTextAreaElement;

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onEmpty).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  hola " } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSubmit).toHaveBeenCalledWith("hola");
    await waitFor(() => expect(input.value).toBe(""));
  });
});
