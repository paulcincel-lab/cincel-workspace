import { describe, expect, it } from "vitest";

import {
  parseStatusValue,
  statusSelectItems,
  statusSelectValue,
  taskStatusLabel,
} from "./status-options";

describe("task status options", () => {
  it("uses the custom status when present, else the base status", () => {
    expect(statusSelectValue({ status: "bloqueado", customStatus: null })).toBe("bloqueado");
    expect(statusSelectValue({ status: "en_proceso", customStatus: { id: "abc" } })).toBe("custom:abc");
  });

  it("round-trips select values", () => {
    expect(parseStatusValue("completado")).toEqual({ kind: "base", status: "completado" });
    expect(parseStatusValue("custom:abc")).toEqual({ kind: "custom", id: "abc" });
  });

  it("labels with the custom name when set", () => {
    expect(taskStatusLabel({ status: "pendiente", customStatus: { name: "En revisión" } })).toBe("En revisión");
    expect(taskStatusLabel({ status: "pendiente" })).toBe("Pendiente");
  });

  it("lists base statuses first, then custom ones", () => {
    const items = statusSelectItems([{ id: "x", name: "En revisión", baseStatus: "en_proceso", sortOrder: 0 }]);
    expect(items.map((i) => i.value)).toEqual([
      "pendiente",
      "en_proceso",
      "completado",
      "bloqueado",
      "custom:x",
    ]);
    expect(items[4].label).toBe("En revisión");
  });
});
