import { describe, expect, it } from "vitest";

import { closedAtPatch } from "./closing";

const now = new Date("2026-11-06T18:00:00.000Z");
const earlier = new Date("2026-10-01T12:00:00.000Z");

describe("closedAtPatch", () => {
  it("sets closed_at when a task becomes completado", () => {
    expect(closedAtPatch({ status: "en_proceso", closedAt: null }, "completado", now)).toEqual({ closedAt: now });
    expect(closedAtPatch({ status: "pendiente", closedAt: null }, "completado", now)).toEqual({ closedAt: now });
  });

  it("keeps closed_at when the task was already closed", () => {
    expect(closedAtPatch({ status: "completado", closedAt: earlier }, "completado", now)).toEqual({});
  });

  it("fills a missing closed_at on a completado task", () => {
    expect(closedAtPatch({ status: "completado", closedAt: null }, "completado", now)).toEqual({ closedAt: now });
  });

  it("clears closed_at when a task leaves completado", () => {
    expect(closedAtPatch({ status: "completado", closedAt: earlier }, "en_proceso", now)).toEqual({ closedAt: null });
    expect(closedAtPatch({ status: "completado", closedAt: earlier }, "bloqueado", now)).toEqual({ closedAt: null });
  });

  it("changes nothing between open statuses", () => {
    expect(closedAtPatch({ status: "pendiente", closedAt: null }, "en_proceso", now)).toEqual({});
    expect(closedAtPatch({ status: "bloqueado", closedAt: null }, "pendiente", now)).toEqual({});
  });

  it("defaults to the current time", () => {
    const patch = closedAtPatch({ status: "pendiente", closedAt: null }, "completado");
    expect(patch.closedAt).toBeInstanceOf(Date);
  });
});
