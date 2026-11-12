// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { CalTaskItem, DetailAction } from "@/lib/types/calendario";

import { EventDetailCard } from "./EventDetailCard";
import { EventDetailDrawer } from "./EventDetailDrawer";
import { EventDetailSheet } from "./EventDetailSheet";
import { taskNote, taskWhen } from "./event-detail-model";

const base: CalTaskItem = {
  kind: "task",
  id: "t:11111111-2222-4333-8444-555555555555",
  taskId: "11111111-2222-4333-8444-555555555555",
  title: "Ingenierías",
  date: "2026-11-13",
  dateField: "commitmentDate",
  project: { id: "p1", name: "Madrid 22" },
  tramo: { id: "w1", key: "diseno", name: "Diseño", colorSlot: 2 },
  phase: { id: "f1", name: "Anteproyecto" },
  status: "pendiente",
  statusLabel: "Pendiente",
  priority: "alta",
  manager: { id: "s1", name: "Ana García" },
  support: [],
  overdue: false,
  completed: false,
  blocked: false,
  hours: 2,
  hoursSource: "task",
  parentTaskId: null,
  canEdit: true,
};
const overdue: CalTaskItem = { ...base, date: "2026-11-09", overdue: true };
const completed: CalTaskItem = { ...base, status: "completado", statusLabel: "Completado", completed: true };

function actionsOf(item: CalTaskItem) {
  const complete = vi.fn();
  const open = vi.fn();
  const propose = vi.fn();
  const pick = vi.fn();
  const list: DetailAction[] = [
    item.completed ? { key: "reopen", label: "Reabrir", onSelect: complete } : { key: "complete", label: "Marcar completada", primary: true, onSelect: complete },
    { key: "open", label: "Abrir tarea", onSelect: open },
    { key: "change-date", label: "Cambiar fecha", onPickDate: pick },
    { key: "propose", label: "✦ Propón otra fecha", onSelect: propose },
  ];
  return { list, complete, open, propose, pick };
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
  if (!("escape" in CSS)) (CSS as unknown as { escape: (s: string) => string }).escape = (s) => s;
});
afterEach(cleanup);

describe("event detail copy", () => {
  it("reads overdue and not overdue", () => {
    expect(taskWhen(base)).toBe("Vence el 13 nov");
    expect(taskWhen(overdue)).toBe("Vencía el 9 nov");
    expect(taskNote(base)).toBe("Fecha compromiso. Arrastra la tarea a otro día para cambiarla.");
    expect(taskNote(overdue)).toContain("Lleva días de retraso.");
  });
});

describe("EventDetailCard", () => {
  it("is a dialog named by the title with the card actions, and Escape closes", () => {
    const a = actionsOf(base);
    const onClose = vi.fn();
    render(<EventDetailCard item={base} actions={a.list} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Ingenierías" })).toBeTruthy();
    expect(screen.getByText("Tarea · Diseño")).toBeTruthy();
    expect(screen.getByText("Madrid 22 · Diseño")).toBeTruthy();
    expect(screen.queryByText("Cambiar fecha")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Marcar completada" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir tarea" }));
    fireEvent.click(screen.getByRole("button", { name: "✦ Propón otra fecha" }));
    expect(a.complete).toHaveBeenCalled();
    expect(a.open).toHaveBeenCalled();
    expect(a.propose).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("offers Reabrir for a completed task and the overdue note for a late one", () => {
    const { unmount } = render(<EventDetailCard item={completed} actions={actionsOf(completed).list} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Reabrir" })).toBeTruthy();
    unmount();
    render(<EventDetailCard item={overdue} actions={actionsOf(overdue).list} onClose={() => {}} />);
    expect(screen.getByText("Vencía el 9 nov")).toBeTruthy();
    expect(screen.getByText(/Lleva días de retraso/)).toBeTruthy();
  });
});

describe("EventDetailSheet", () => {
  it("shows the primary action, the secondaries and the date picker", () => {
    const a = actionsOf(base);
    render(<EventDetailSheet item={base} actions={a.list} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar completada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abrir tarea" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar fecha" }));
    fireEvent.change(screen.getByLabelText("Nueva fecha compromiso"), { target: { value: "2026-11-20" } });
    expect(a.pick).toHaveBeenCalledWith("2026-11-20");
    expect(screen.getByRole("button", { name: "✦ Propón otra fecha" })).toBeTruthy();
  });
});

describe("EventDetailDrawer", () => {
  it("lists the fields and the history, and names Abrir ficha", () => {
    const a = actionsOf(base);
    const task = {
      subtaskCount: 3,
      subtaskDoneCount: 1,
      history: [{ id: "h1", entity: "task", entityId: base.taskId, kind: "cambio", actor: { id: "s1", name: "Ana García" }, field: "fecha", beforeValue: "a", afterValue: "b", comment: null, eventAt: "2026-11-10T10:00:00Z" }],
    } as never;
    render(<EventDetailDrawer item={base} task={task} actions={a.list} onClose={() => {}} />);
    expect(screen.getByText("Código")).toBeTruthy();
    expect(screen.getByText("Anteproyecto")).toBeTruthy();
    expect(screen.getByText("1 de 3")).toBeTruthy();
    expect(screen.getByText("HISTORIAL")).toBeTruthy();
    expect(screen.getByText(/Cambió fecha/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abrir ficha" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Marcar completada" })).toBeTruthy();
  });
});
