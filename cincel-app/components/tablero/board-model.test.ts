import { describe, expect, it } from "vitest";

import { boardColumns, customStatusesOf, flattenBoard, groupTasksByColumn } from "@/components/tablero/board-model";
import { taskBoardFixture, taskBoardTasks } from "@/components/widgets/fixtures/task-board";

describe("board model", () => {
  it("flattens the board in base status order", () => {
    expect(flattenBoard(taskBoardFixture).map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6", "t7"]);
  });

  it("builds base columns then custom ones, deduplicating custom statuses", () => {
    const customs = customStatusesOf([...taskBoardTasks, ...taskBoardTasks]);
    expect(customs).toEqual([{ id: "cs-rev", name: "En revisión" }]);
    expect(boardColumns(customs).map((c) => c.key)).toEqual([
      "pendiente",
      "en_proceso",
      "completado",
      "bloqueado",
      "custom:cs-rev",
    ]);
  });

  it("puts a task in its custom column, falls back to its base column, and honors overrides", () => {
    const withCustom = boardColumns([{ id: "cs-rev", name: "En revisión" }]);
    const grouped = groupTasksByColumn(taskBoardTasks, withCustom);
    expect(grouped["custom:cs-rev"].map((t) => t.id)).toEqual(["t6"]);
    expect(grouped.en_proceso.map((t) => t.id)).toEqual(["t4", "t5"]);

    const baseOnly = groupTasksByColumn(taskBoardTasks, boardColumns([]));
    expect(baseOnly.en_proceso.map((t) => t.id)).toEqual(["t4", "t5", "t6"]);

    const moved = groupTasksByColumn(taskBoardTasks, withCustom, (t) => (t.id === "t1" ? "bloqueado" : t.customStatus ? `custom:${t.customStatus.id}` : t.status));
    expect(moved.bloqueado.map((t) => t.id)).toEqual(["t1"]);
    expect(moved.pendiente.map((t) => t.id)).toEqual(["t2", "t3"]);
  });
});
