// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { UIMessage } from "ai";

import { ConfirmationCard, type ConfirmationCardProps } from "../ConfirmationCard";
import { ToolSteps } from "@/components/widgets/ToolSteps";
import { toolStepGroupsOf, type ToolApprovalGroup } from "@/lib/assistant/tool-steps";
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

function createTask(id: string, state = "approval-requested", extra: Record<string, unknown> = {}) {
  return {
    type: "tool-create_task",
    toolCallId: `call-${id}`,
    state,
    input: {
      description: `Revisión ${id}`,
      project: "Oficina Polanco",
      workflow: "diseno",
      manager: "Ana Ruiz",
      commitmentDate: "2026-11-13",
    },
    approval: { id: `approval-${id}`, ...(state === "output-denied" ? { approved: false } : {}) },
    ...extra,
  };
}

function groupOf(parts: unknown[]): ToolApprovalGroup {
  const [group] = toolStepGroupsOf(parts as UIMessage["parts"]);
  if (!group || group.kind !== "approval") throw new Error("not an approval group");
  return group;
}

const FOUR = ["1", "2", "3", "4"].map((id) => createTask(id));

describe("ConfirmationCard (grouped)", () => {
  it("renders one card with the preview rows for consecutive approvals", () => {
    render(<ConfirmationCard group={groupOf(FOUR)} onRespond={() => {}} />);
    const card = screen.getByRole("group", { name: "¿Confirmas crear 4 tareas?" });
    expect(card.textContent).toContain("Oficina Polanco · vencen vie 13 nov · nada cambia hasta que confirmes");
    expect(card.querySelectorAll("li")).toHaveLength(4);
    expect(card.textContent).toContain("Revisión 1");
    expect(card.textContent).toContain("Diseño");
    expect(screen.getByRole("button", { name: "Confirmar y crear 4" })).toBeTruthy();
    expect(screen.getByText("Esperando tu confirmación")).toBeTruthy();
  });

  it("confirm answers every approval id once", () => {
    const onApprove = vi.fn();
    render(<ToolSteps parts={FOUR as unknown as UIMessage["parts"]} onApprove={onApprove} />);
    const confirm = screen.getByRole("button", { name: "Confirmar y crear 4" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove.mock.calls[0]![0]).toEqual(["approval-1", "approval-2", "approval-3", "approval-4"]);
    expect(onApprove.mock.calls[0]![1]).toBe(true);
  });

  it("cancel denies every id", () => {
    const onApprove = vi.fn();
    render(<ToolSteps parts={FOUR as unknown as UIMessage["parts"]} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove.mock.calls[0]![0]).toEqual(["approval-1", "approval-2", "approval-3", "approval-4"]);
    expect(onApprove.mock.calls[0]![1]).toBe(false);
  });

  it("Editar denies with reason editado and hands the rows to the composer", () => {
    const onRespond = vi.fn();
    const onEdit = vi.fn();
    render(<ConfirmationCard group={groupOf(FOUR.slice(0, 2))} onRespond={onRespond} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(onRespond).toHaveBeenCalledWith(false, "editado");
    expect(onEdit).toHaveBeenCalledWith("Crea estas tareas:\n- Revisión 1 · Ana Ruiz · vie 13 nov\n- Revisión 2 · Ana Ruiz · vie 13 nov");
  });

  it("focus moves to the result line", () => {
    const { rerender } = render(<ConfirmationCard group={groupOf(FOUR)} onRespond={() => {}} />);
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear 4" }));
    const line = document.querySelector("[data-confirmation-result]") as HTMLElement;
    expect(line).toBeTruthy();
    expect(line.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(line);

    // The final state replaces the buttons and keeps the focus on the same line.
    const done = FOUR.map((part) => ({ ...part, state: "output-available", output: { ok: true } }));
    rerender(<ConfirmationCard group={groupOf(done)} onRespond={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Hecho");
    expect(document.activeElement).toBe(document.querySelector("[data-confirmation-result]"));
  });

  it("mixed results show 3 de 4 hechas", () => {
    const parts = FOUR.map((part, index) =>
      index === 2
        ? { ...part, state: "output-available", output: { ok: false, error: "NOT_FOUND", message: "No encontré a Ana Ruiz." } }
        : { ...part, state: "output-available", output: { ok: true } },
    );
    render(<ConfirmationCard group={groupOf(parts)} onRespond={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("3 de 4 hechas");
    expect(screen.getByText("Revisión 3: No encontré a Ana Ruiz.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a tool without preview keeps the summary card", () => {
    const parts = ["1", "2"].map((id) => ({
      type: `tool-${TOOL}`,
      toolCallId: `call-${id}`,
      state: "approval-requested",
      input: { title: `Llamar ${id}`, at: "10 nov 9:00" },
      approval: { id: `approval-${id}` },
    }));
    render(<ConfirmationCard group={groupOf(parts)} onRespond={() => {}} />);
    expect(screen.getByRole("group", { name: "¿Confirmas esta acción?" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeTruthy();
  });
});
