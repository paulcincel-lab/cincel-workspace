import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { normalizeTaskStatusInput, underlyingStatus } from "./task-statuses-repository";

describe("normalizeTaskStatusInput", () => {
  it("trims the name and defaults closes and sortOrder", () => {
    expect(normalizeTaskStatusInput({ name: "  En revisión " })).toEqual({
      name: "En revisión",
      closes: false,
      countsAsCompleted: false,
      sortOrder: 0,
    });
    expect(normalizeTaskStatusInput({ name: "Entregado", closes: true }).closes).toBe(true);
  });

  it("only lets a closing status count as completed", () => {
    expect(normalizeTaskStatusInput({ name: "Entregado", closes: true }).countsAsCompleted).toBe(true);
    expect(
      normalizeTaskStatusInput({ name: "Cancelado", closes: true, countsAsCompleted: false }).countsAsCompleted
    ).toBe(false);
    expect(() => normalizeTaskStatusInput({ name: "En espera", countsAsCompleted: true })).toThrow("INVALID");
  });

  it("rejects empty names", () => {
    expect(() => normalizeTaskStatusInput({ name: "  " })).toThrow("TASK_STATUS_NAME_REQUIRED");
  });
});

describe("underlyingStatus", () => {
  it("keeps tasks open unless the status closes them", () => {
    expect(underlyingStatus({ closes: false })).toBe("en_proceso");
    expect(underlyingStatus({ closes: true })).toBe("completado");
  });
});
