// @vitest-environment node
import { describe, expect, it } from "vitest";

import { columnFill } from "./column-fill";

describe("columnFill", () => {
  it("share of items with a value per column", () => {
    const items = [
      { column_values: [{ id: "date", text: "2026-01-02" }, { id: "status", text: "", label: "Listo" }, { id: "notes", text: "  " }] },
      { column_values: [{ id: "date", text: "" }, { id: "status", text: "Trabajando" }] },
      { column_values: [{ id: "date", text: "2026-03-04" }, { id: "notes", text: "Revisar" }] },
      { column_values: [] },
    ];
    expect(columnFill(["date", "status", "notes", "people"], items)).toEqual({
      date: 0.5,
      status: 0.5,
      notes: 0.25,
      people: 0,
    });
  });

  it("is 0 for every column of a board without items", () => {
    expect(columnFill(["a", "b"], [])).toEqual({ a: 0, b: 0 });
  });

  it("counts an item once per column and divides by the given item count", () => {
    const items = [{ column_values: [{ id: "a", text: "x" }, { id: "a", text: "y" }] }];
    expect(columnFill(["a"], items, 3)).toEqual({ a: 0.3333 });
  });
});
