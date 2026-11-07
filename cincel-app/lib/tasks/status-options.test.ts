import { describe, expect, it } from "vitest";

import {
  isTaskClosed,
  isTaskCompleted,
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

  it("treats Completado and closing custom statuses as finished", () => {
    expect(isTaskClosed({ status: "completado", customStatus: null })).toBe(true);
    expect(isTaskClosed({ status: "en_proceso", customStatus: { closes: true } })).toBe(true);
    expect(isTaskClosed({ status: "en_proceso", customStatus: { closes: false } })).toBe(false);
    expect(isTaskClosed({ status: "bloqueado" })).toBe(false);
  });

  it("counts only completed work as completed: Cancelado closes but isn't completed", () => {
    expect(isTaskCompleted({ status: "completado", customStatus: null })).toBe(true);
    expect(isTaskCompleted({ status: "completado" })).toBe(true);
    expect(isTaskCompleted({ status: "completado", customStatus: { countsAsCompleted: true } })).toBe(true);
    // "Cancelado": a closing custom status that doesn't count as completed.
    const cancelado = { status: "completado" as const, customStatus: { closes: true, countsAsCompleted: false } };
    expect(isTaskClosed(cancelado)).toBe(true);
    expect(isTaskCompleted(cancelado)).toBe(false);
    expect(isTaskCompleted({ status: "en_proceso", customStatus: null })).toBe(false);
    expect(isTaskCompleted({ status: "bloqueado", customStatus: { countsAsCompleted: true } })).toBe(false);
  });

  it("labels with the custom name when set", () => {
    expect(taskStatusLabel({ status: "pendiente", customStatus: { name: "En revisión" } })).toBe("En revisión");
    expect(taskStatusLabel({ status: "pendiente" })).toBe("Pendiente");
  });

  it("lists base statuses first, then custom ones", () => {
    const items = statusSelectItems([{ id: "x", name: "En revisión", closes: false, countsAsCompleted: false, sortOrder: 0 }]);
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
