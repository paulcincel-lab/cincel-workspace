import { describe, expect, it } from "vitest";

import { analiticoTaskRow } from "./fixtures/analitico-summary";
import { withSubtaskRows, listaTable } from "./lista-table";
import { NESTED_ROW_PARENT } from "@/components/widgets/record-table-format";
import { listItemOfRow } from "@/lib/tareas/page-data";
import {
  ADD_SUBTASK_ACTION,
  canAddFirstSubtask,
  hasSubtasks,
  openByDefault,
  shownChildren,
  subtaskOfLabel,
  subtasksAnnouncement,
  subtasksToggleLabel,
  toggledForAll,
} from "./use-subtask-rows";

const parent = analiticoTaskRow({ id: "p", title: "Diseño", subtaskCount: 2, subtaskDoneCount: 1 });
const childA = analiticoTaskRow({ id: "a", title: "subtarea uno", parentTaskId: "p", status: "completado" });
const childB = analiticoTaskRow({ id: "b", title: "subtarea dos", parentTaskId: "p" });

describe("subtask block helpers (#1048)", () => {
  it("only a top-level task with subtasks gets a toggle (one level)", () => {
    expect(hasSubtasks(parent)).toBe(true);
    expect(hasSubtasks({ ...parent, subtaskCount: 0 })).toBe(false);
    expect(hasSubtasks({ ...childA, subtaskCount: 3 })).toBe(false);
    // Context parent of a matching subtask.
    expect(hasSubtasks({ ...parent, subtaskCount: 0, matchedSubtaskIds: ["a"] })).toBe(true);
  });

  it("collapsed by default; a context parent starts open", () => {
    expect(openByDefault(parent)).toBe(false);
    expect(openByDefault({ ...parent, matchedSubtaskIds: ["b"] })).toBe(true);
  });

  it("shows only the matching children of a context parent, without hidden ones", () => {
    expect(shownChildren(parent, [childA, childB]).map((c) => c.id)).toEqual(["a", "b"]);
    expect(shownChildren({ ...parent, matchedSubtaskIds: ["b"] }, [childA, childB]).map((c) => c.id)).toEqual(["b"]);
    expect(shownChildren(parent, [childA, childB], (id) => id === "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("expand / collapse all flips against each parent's default", () => {
    const ctx = { id: "c", matchedSubtaskIds: ["x"] };
    expect([...toggledForAll([parent, ctx], true)]).toEqual(["p"]);
    expect([...toggledForAll([parent, ctx], false)]).toEqual(["c"]);
  });

  it("copy", () => {
    expect(subtasksToggleLabel("Diseño")).toBe("Subtareas de «Diseño»");
    expect(subtaskOfLabel("Diseño")).toBe("subtarea de «Diseño»");
    expect(subtasksAnnouncement(true, 1)).toBe("Subtareas abiertas de 1 tarea");
    expect(subtasksAnnouncement(false, 3)).toBe("Subtareas cerradas de 3 tareas");
  });
});

describe("withSubtaskRows (Lista, #1048)", () => {
  it("puts an open parent's subtasks right after it, in the parent's estatus group", () => {
    const table = listaTable([listItemOfRow(parent)], "2026-11-09");
    const rows = withSubtaskRows(table.rows, (id) => (id === "p" ? [childA, childB].map(listItemOfRow) : undefined), "2026-11-09");
    expect(rows.map((r) => r.id)).toEqual(["p", "a", "b"]);
    // childA is completado but stays under its parent (Pendiente).
    expect(rows.map((r) => r.estatus)).toEqual(["Pendiente", "Pendiente", "Pendiente"]);
    expect(rows[1][NESTED_ROW_PARENT]).toBe("p");
    expect(rows[0][NESTED_ROW_PARENT]).toBeUndefined();
    // The by-project summary stays the parents'.
    expect(rows[1].abiertas).toBeNull();
  });

  it("leaves closed parents alone", () => {
    const table = listaTable([listItemOfRow(parent)], "2026-11-09");
    expect(withSubtaskRows(table.rows, () => undefined)).toEqual(table.rows);
  });
});

describe("first subtask inline (#1107)", () => {
  it("only a top-level task without subtasks can get its first one", () => {
    expect(canAddFirstSubtask({ ...parent, subtaskCount: 0 })).toBe(true);
    expect(canAddFirstSubtask(parent)).toBe(false);
    expect(canAddFirstSubtask({ ...childA, subtaskCount: 0 })).toBe(false);
    expect(canAddFirstSubtask({ ...parent, subtaskCount: 0, matchedSubtaskIds: ["a"] })).toBe(false);
  });

  it("names the row menu entry", () => {
    expect(ADD_SUBTASK_ACTION).toBe("Agregar subtarea");
  });
});
