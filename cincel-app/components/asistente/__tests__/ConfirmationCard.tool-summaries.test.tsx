// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConfirmationCard, type ConfirmationPart } from "../ConfirmationCard";
import { summarizeCreateNote } from "@/lib/assistant/tool-summaries";

afterEach(cleanup);

function part(state: ConfirmationPart["state"], errorText?: string): ConfirmationPart {
  return {
    toolCallId: "call-1",
    toolName: "create_note",
    input: { title: "Compras de obra" },
    state,
    approvalId: "ap-1",
    errorText,
  };
}

describe("ConfirmationCard", () => {
  it("requested: shows the summary from tool-summaries and answers Confirmar", () => {
    const onRespond = vi.fn();
    render(<ConfirmationCard part={part("approval-requested")} onRespond={onRespond} />);

    expect(screen.getByText(summarizeCreateNote({ title: "Compras de obra" }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onRespond).toHaveBeenCalledWith(true);
    // A second click can't send a second response.
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onRespond).toHaveBeenCalledTimes(1);
  });

  it("requested: Cancelar answers false", () => {
    const onRespond = vi.fn();
    render(<ConfirmationCard part={part("approval-requested")} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onRespond).toHaveBeenCalledWith(false);
  });

  it("available: shows Hecho and no buttons", () => {
    render(<ConfirmationCard part={part("output-available")} onRespond={vi.fn()} />);
    expect(screen.getByText("Hecho")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("denied: shows Cancelado", () => {
    render(<ConfirmationCard part={part("output-denied")} onRespond={vi.fn()} />);
    expect(screen.getByText("Cancelado")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("error: shows the actionErrorText copy", () => {
    render(<ConfirmationCard part={part("output-error", "FORBIDDEN: no puede")} onRespond={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe("No tienes permiso para realizar esta acción.");
  });

  it("error without a known code falls back to the generic copy", () => {
    render(<ConfirmationCard part={part("output-error", "boom")} onRespond={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toBe("No se pudo completar la acción. Intenta de nuevo.");
  });

  it("falls back to the tool name when the tool has no summary", () => {
    render(
      <ConfirmationCard
        part={{ ...part("approval-requested"), toolName: "herramienta_desconocida" }}
        onRespond={vi.fn()}
      />,
    );
    expect(screen.getByText("herramienta_desconocida")).toBeTruthy();
  });
});
