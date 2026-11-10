import { describe, expect, it } from "vitest";

import { CellEditor } from "@/components/widgets/CellEditor";
import { EditableCell } from "@/components/widgets/EditableCell";
import { cellEditState, type CellEdit, quickPickDate, SAVED_TOAST, toIsoDate, UNDO_MS } from "@/components/widgets/editable-cell";
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

  it("quick pick dates count from today in local time", () => {
    const tue = new Date(2026, 10, 10, 23, 30); // Tuesday 10 Nov 2026, late evening
    expect(toIsoDate(tue)).toBe("2026-11-10");
    expect(quickPickDate("today", tue)).toBe("2026-11-10");
    expect(quickPickDate("tomorrow", tue)).toBe("2026-11-11");
    expect(quickPickDate("next-monday", tue)).toBe("2026-11-16");
    expect(quickPickDate("plus-week", tue)).toBe("2026-11-17");
    expect(quickPickDate("none", tue)).toBeNull();
    // On a Monday, "Próximo lunes" is the one a week later; month ends roll over.
    expect(quickPickDate("next-monday", new Date(2026, 10, 16))).toBe("2026-11-23");
    expect(quickPickDate("tomorrow", new Date(2026, 11, 31))).toBe("2027-01-01");
  });
});
