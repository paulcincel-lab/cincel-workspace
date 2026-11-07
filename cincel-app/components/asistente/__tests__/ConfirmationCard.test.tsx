// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConfirmationCard, type ConfirmationCardProps } from "../ConfirmationCard";
import { toolSummaries } from "@/lib/assistant/tool-summaries";

const TOOL = "test_create_reminder";

function part(overrides: Partial<ConfirmationCardProps["part"]> = {}): ConfirmationCardProps["part"] {
  return {
    toolCallId: "call-1",
    toolName: TOOL,
    input: { title: "Llamar al proveedor", at: "10 nov 9:00" },
    state: "approval-requested",
    approvalId: "approval-1",
    ...overrides,
  };
}

beforeEach(() => {
  toolSummaries[TOOL] = (input) => {
    const { title, at } = input as { title: string; at: string };
    return `Crear recordatorio "${title}" para ${at}`;
  };
});

afterEach(() => {
  delete toolSummaries[TOOL];
  cleanup();
});

describe("ConfirmationCard", () => {
  it("renders the approval request with the summary from tool-summaries", () => {
    render(<ConfirmationCard part={part()} onRespond={() => {}} />);
    expect(screen.getByRole("group", { name: "¿Confirmas esta acción?" })).toBeTruthy();
    expect(screen.getByText('Crear recordatorio "Llamar al proveedor" para 10 nov 9:00')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("falls back to the tool name when no summary is registered", () => {
    render(<ConfirmationCard part={part({ toolName: "unknown_tool" })} onRespond={() => {}} />);
    expect(screen.getByText("unknown_tool")).toBeTruthy();
  });

  it("Confirmar calls onRespond(true) once", () => {
    const onRespond = vi.fn();
    render(<ConfirmationCard part={part()} onRespond={onRespond} />);
    const confirm = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith(true);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("Cancelar calls onRespond(false)", () => {
    const onRespond = vi.fn();
    render(<ConfirmationCard part={part()} onRespond={onRespond} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(onRespond).toHaveBeenCalledWith(false);
  });

  it('shows "Hecho" once the tool ran, without buttons', () => {
    render(<ConfirmationCard part={part({ state: "output-available" })} onRespond={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Hecho");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText('Crear recordatorio "Llamar al proveedor" para 10 nov 9:00')).toBeTruthy();
  });

  it('shows "Cancelado" when the approval was denied', () => {
    render(<ConfirmationCard part={part({ state: "output-denied" })} onRespond={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Cancelado");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the actionErrorText copy on error", () => {
    render(
      <ConfirmationCard part={part({ state: "output-error", errorText: "FORBIDDEN: not yours" })} onRespond={() => {}} />,
    );
    expect(screen.getByRole("alert").textContent).toContain("No tienes permiso para realizar esta acción.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the generic copy for an unknown or missing error", () => {
    render(<ConfirmationCard part={part({ state: "output-error" })} onRespond={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("No se pudo completar la acción. Intenta de nuevo.");
  });
});
