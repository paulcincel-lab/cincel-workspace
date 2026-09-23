import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { normalizeTaskStatusInput, underlyingStatus } from "./task-statuses-repository";

describe("normalizeTaskStatusInput", () => {
  it("trims the name and defaults closes and sortOrder", () => {
    expect(normalizeTaskStatusInput({ name: "  En revisión " })).toEqual({
      name: "En revisión",
      closes: false,
      sortOrder: 0,
    });
    expect(normalizeTaskStatusInput({ name: "Entregado", closes: true }).closes).toBe(true);
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
