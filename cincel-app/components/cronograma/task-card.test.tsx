import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TaskCard } from "./task-card";
import type { ScheduleTask } from "@/lib/types/schedule";

function makeTask(overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id: "t1",
    stableKey: "PB-abc",
    legacyId: "PB-1",
    planta: "PB",
    seccion: "Preliminares",
    responsable: "Chava",
    inicio: "2026-06-22",
    fin: "2026-06-27",
    tarea: "Tarea de prueba",
    status: "pending",
    flagged: false,
    ...overrides,
  };
}

describe("TaskCard", () => {
  it("clicking the status button cycles pending -> progress", () => {
    const onCycleStatus = vi.fn();
    render(<TaskCard task={makeTask({ status: "pending" })} onCycleStatus={onCycleStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Estado: Pendiente/ }));
    expect(onCycleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), "progress");
  });

  it("clicking the status button cycles progress -> done", () => {
    const onCycleStatus = vi.fn();
    render(<TaskCard task={makeTask({ status: "progress" })} onCycleStatus={onCycleStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Estado: En proceso/ }));
    expect(onCycleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), "done");
  });

  it("clicking the status button cycles done -> pending", () => {
    const onCycleStatus = vi.fn();
    render(<TaskCard task={makeTask({ status: "done" })} onCycleStatus={onCycleStatus} />);
    fireEvent.click(screen.getByRole("button", { name: /Estado: Realizada/ }));
    expect(onCycleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }), "pending");
  });

  it("clicking the flag button toggles it", () => {
    const onToggleFlag = vi.fn();
    render(<TaskCard task={makeTask({ flagged: false })} onToggleFlag={onToggleFlag} />);
    fireEvent.click(screen.getByRole("button", { name: "Marcar atención especial" }));
    expect(onToggleFlag).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
  });

  it("pressing F toggles the flag regardless of which element has focus", () => {
    const onToggleFlag = vi.fn();
    const { container } = render(<TaskCard task={makeTask()} onToggleFlag={onToggleFlag} />);
    fireEvent.keyDown(container.firstChild as Element, { key: "f" });
    expect(onToggleFlag).toHaveBeenCalledTimes(1);
  });

  it("readOnly renders no interactive controls", () => {
    const onCycleStatus = vi.fn();
    const onToggleFlag = vi.fn();
    render(<TaskCard task={makeTask({ flagged: true })} readOnly onCycleStatus={onCycleStatus} onToggleFlag={onToggleFlag} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
