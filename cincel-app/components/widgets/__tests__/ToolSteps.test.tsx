// @vitest-environment happy-dom
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { ToolSteps, ToolStepsLiveRegion } from "@/components/widgets/ToolSteps";

afterEach(cleanup);

type Parts = UIMessage["parts"];

const TASKS = [
  { title: "Planos de cancelería", tramo: "Diseño", manager: "Ana Ruiz", commitmentDate: "2026-10-20" },
  { title: "Render del lobby", tramo: "Diseño", manager: "Jorge Mena", commitmentDate: "2026-11-02" },
  { title: "Cotizar acabados", tramo: "Construcción", manager: "Luis Paz", commitmentDate: "2026-11-05" },
  { title: "Revisar instalaciones", tramo: "Construcción", manager: "Ana Ruiz", commitmentDate: "2026-11-06" },
  { title: "Ajustar presupuesto", tramo: "Presale", manager: "Eva Gil", commitmentDate: "2026-11-07" },
];

function listTasks(state: string, extra: Record<string, unknown> = {}, id = "c1") {
  return { type: "tool-list_my_tasks", toolCallId: id, state, input: { due: "vencidas", project: "Oficina Polanco" }, ...extra };
}

const DONE = listTasks("output-available", { output: { total: 5, tasks: TASKS } });

describe("ToolSteps", () => {
  it("timeline shows chip and duration per step", () => {
    const parts = [
      DONE,
      { type: "tool-team_workload_summary", toolCallId: "c2", state: "input-available", input: {} },
    ] as unknown as Parts;
    render(<ToolSteps parts={parts} meta={{ toolMs: { c1: 640 } }} />);

    const list = screen.getByRole("list", { name: "Pasos del asistente" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Buscó tus tareas vencidas");
    expect(items[0]!.textContent).toContain("Listo");
    expect(items[0]!.textContent).toContain("0.6 s");
    // Running: the running copy, the chip, and "—" until the duration arrives.
    expect(items[1]!.textContent).toContain("Revisando la carga del equipo…");
    expect(items[1]!.textContent).toContain("En curso");
    expect(items[1]!.textContent).toContain("—");
  });

  it("toggle expands params and results with keyboard", () => {
    render(<ToolSteps parts={[DONE] as unknown as Parts} mode="expanded" />);
    const toggle = screen.getByRole("button", { name: /Buscó tus tareas vencidas/ });
    // A native button: Enter and Space activate it.
    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    toggle.focus();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const params = screen.getByRole("list", { name: "Parámetros" });
    expect(params.textContent).toContain("proyecto Oficina Polanco");
    expect(params.textContent).toContain("vence vencidas");
    expect(screen.getByRole("list", { name: "Resultados" })).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: "Parámetros" })).toBeNull();
  });

  it("shows first 4 result cards and the count link", () => {
    render(<ToolSteps parts={[DONE] as unknown as Parts} mode="expanded" />);
    fireEvent.click(screen.getByRole("button", { name: /Buscó tus tareas vencidas/ }));
    const results = screen.getByRole("list", { name: "Resultados" });
    expect(within(results).getAllByRole("listitem")).toHaveLength(4);
    expect(results.textContent).toContain("Planos de cancelería");
    expect(results.textContent).toContain("Diseño · Ana Ruiz");
    expect(results.textContent).not.toContain("Ajustar presupuesto");
    const link = screen.getByRole("link", { name: "5 encontradas · Ver en Tareas →" });
    expect(link.getAttribute("href")).toBe("/tareas");
  });

  it("collapsed summary pluralizes", () => {
    const { unmount } = render(<ToolSteps parts={[DONE] as unknown as Parts} meta={{ toolMs: { c1: 1400 } }} />);
    const one = screen.getByRole("button", { name: /1 herramienta usada/ });
    expect(one.getAttribute("aria-expanded")).toBe("false");
    expect(one.textContent).toContain("1.4 s");
    expect(screen.queryByRole("list", { name: "Pasos del asistente" })).toBeNull();
    fireEvent.click(one);
    expect(screen.getByRole("list", { name: "Pasos del asistente" })).toBeTruthy();
    unmount();

    const three = [DONE, listTasks("output-available", { output: { tasks: [] } }, "c2"), listTasks("output-error", {}, "c3")];
    render(<ToolSteps parts={three as unknown as Parts} />);
    expect(screen.getByRole("button", { name: /3 herramientas usadas/ })).toBeTruthy();
  });

  it("compact variant shows one line and the timeline without result cards", () => {
    render(<ToolSteps parts={[DONE, listTasks("output-available", { output: { tasks: [] } }, "c2")] as unknown as Parts} variant="compact" />);
    const toggle = screen.getByRole("button", { name: /Usó 2 herramientas · Ver/ });
    fireEvent.click(toggle);
    expect(toggle.textContent).toContain("Ocultar");
    fireEvent.click(screen.getAllByRole("button", { name: /Buscó tus tareas vencidas/ })[0]!);
    expect(screen.queryByRole("list", { name: "Resultados" })).toBeNull();
  });

  it("groups same-tool approvals into one card that answers every id", () => {
    const onApprove = vi.fn();
    const approval = (id: string) => ({
      type: "tool-create_task",
      toolCallId: id,
      state: "approval-requested",
      input: { description: `Revisión ${id}`, project: "Oficina Polanco", workflow: "diseno", commitmentDate: "2026-11-13" },
      approval: { id: `ap-${id}` },
    });
    render(<ToolSteps parts={[approval("1"), approval("2")] as unknown as Parts} onApprove={onApprove} />);
    expect(screen.getAllByRole("group")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear 2" }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(["ap-1", "ap-2"], true, undefined);
  });

  it("announces state changes once", () => {
    const message = (parts: unknown[]): UIMessage => ({ id: "m1", role: "assistant", parts: parts as Parts });
    const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "¿Qué venció?" }] };
    const { rerender } = render(<ToolStepsLiveRegion messages={[user]} />);
    const region = screen.getByTestId("tool-steps-live");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");

    rerender(<ToolStepsLiveRegion messages={[user, message([listTasks("input-available")])]} />);
    expect(region.textContent).toBe("Buscando tus tareas…");

    // Same state again (e.g. text streaming after the step): nothing new.
    region.textContent = "";
    rerender(<ToolStepsLiveRegion messages={[user, message([listTasks("input-available"), { type: "text", text: "Hay" }])]} />);
    expect(region.textContent).toBe("");

    rerender(<ToolStepsLiveRegion messages={[user, message([DONE, { type: "text", text: "Hay 5" }])]} />);
    expect(region.textContent).toBe("Listo: Buscó tus tareas vencidas");

    region.textContent = "";
    rerender(<ToolStepsLiveRegion messages={[user, message([DONE, { type: "text", text: "Hay 5 tareas" }])]} />);
    expect(region.textContent).toBe("");

    rerender(
      <ToolStepsLiveRegion
        messages={[
          user,
          message([DONE, listTasks("output-available", { output: { ok: false, error: "NOT_FOUND", message: "No encontré el proyecto." } }, "c2")]),
        ]}
      />,
    );
    expect(region.textContent).toBe("Error: No encontré el proyecto.");
  });

  it("does not announce the steps already on screen when the chat mounts", () => {
    const loaded: UIMessage = { id: "m0", role: "assistant", parts: [DONE] as unknown as Parts };
    render(<ToolStepsLiveRegion messages={[loaded]} />);
    expect(screen.getByTestId("tool-steps-live").textContent).toBe("");
  });
});
