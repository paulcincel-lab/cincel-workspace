import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SubtaskCountBadge, SubtaskOfLine, WaitingBadge } from "./TaskRowMeta";

describe("SubtaskOfLine", () => {
  it("shows the parent title for a child task", () => {
    render(
      <SubtaskOfLine
        task={{ parentTaskId: "p1", parentTitle: "Planos ejecutivos" }}
      />,
    );
    expect(screen.getByText("Subtarea de Planos ejecutivos")).toBeTruthy();
  });

  it("says the parent was deleted when it has no title", () => {
    render(<SubtaskOfLine task={{ parentTaskId: "p1", parentTitle: null }} />);
    expect(screen.getByText("Tarea padre eliminada")).toBeTruthy();
    expect(screen.queryByText(/Subtarea de/)).toBeNull();
  });

  it("renders nothing for a top-level task", () => {
    const { container } = render(
      <SubtaskOfLine task={{ parentTaskId: null, parentTitle: null }} />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("SubtaskCountBadge", () => {
  it("shows done/total subtareas", () => {
    render(
      <SubtaskCountBadge task={{ subtaskCount: 3, subtaskDoneCount: 2 }} />,
    );
    expect(screen.getByText("2/3 subtareas")).toBeTruthy();
  });

  it("renders nothing without subtasks", () => {
    const { container } = render(
      <SubtaskCountBadge task={{ subtaskCount: 0, subtaskDoneCount: 0 }} />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("WaitingBadge", () => {
  it("shows En espera when waitingOn > 0", () => {
    render(<WaitingBadge waitingOn={1} />);
    expect(screen.getByText("En espera")).toBeTruthy();
  });

  it.each([0, -1])("renders nothing when waitingOn is %i", (waitingOn) => {
    const { container } = render(<WaitingBadge waitingOn={waitingOn} />);
    expect(container.textContent).toBe("");
  });
});
