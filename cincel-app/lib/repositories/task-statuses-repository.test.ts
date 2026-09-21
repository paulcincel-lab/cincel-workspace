import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { normalizeTaskStatusInput } from "./task-statuses-repository";

describe("normalizeTaskStatusInput", () => {
  it("trims the name and defaults sortOrder", () => {
    expect(normalizeTaskStatusInput({ name: "  En revisión ", baseStatus: "en_proceso" })).toEqual({
      name: "En revisión",
      baseStatus: "en_proceso",
      sortOrder: 0,
    });
  });

  it("rejects empty names and invalid base statuses", () => {
    expect(() => normalizeTaskStatusInput({ name: "  ", baseStatus: "pendiente" })).toThrow(
      "TASK_STATUS_NAME_REQUIRED"
    );
    expect(() =>
      normalizeTaskStatusInput({ name: "x", baseStatus: "nope" as never })
    ).toThrow("TASK_STATUS_BASE_INVALID");
  });
});
