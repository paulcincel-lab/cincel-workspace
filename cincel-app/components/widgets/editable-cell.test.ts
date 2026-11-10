import { describe, expect, it } from "vitest";

import { CellEditor } from "@/components/widgets/CellEditor";
import { EditableCell } from "@/components/widgets/EditableCell";
import { cellEditState, type CellEdit, SAVED_TOAST, UNDO_MS } from "@/components/widgets/editable-cell";
import { useCellCommit } from "@/components/widgets/use-cell-commit";

type Row = { id: string; title: string };
const edit: CellEdit<Row> = {
  kind: "text",
  required: true,
  value: (row) => row.title,
  commit: async () => ({ ok: true, data: null }),
};
const row: Row = { id: "t1", title: "Planos" };

describe("editable-cell contract", () => {
  it("exports the editor, wrapper and commit hook", () => {
    expect(typeof CellEditor).toBe("function");
    expect(typeof EditableCell).toBe("function");
    expect(typeof useCellCommit).toBe("function");
  });

  it("copy", () => {
    expect(SAVED_TOAST("Fase")).toBe("Fase guardado.");
    expect(UNDO_MS).toBe(5000);
  });

  it("cellEditState: inert without edit, locked with a reason, editable otherwise", () => {
    expect(cellEditState(row)).toEqual({ state: "inert" });
    expect(cellEditState(row, edit)).toEqual({ state: "editable" });
    expect(cellEditState(row, edit, () => "Solo un admin.")).toEqual({ state: "locked", reason: "Solo un admin." });
    expect(cellEditState(row, edit, () => true)).toEqual({ state: "editable" });
  });
});
