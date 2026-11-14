// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ admin: true }));
const repo = vi.hoisted(() => ({
  listMejoras: vi.fn(async () => ({ rows: [], nextCursor: null })),
  getMejorasCounts: vi.fn(async () => ({
    byStatus: { nuevo: 1, en_revision: 0, planeado: 0, en_progreso: 0, resuelto: 0, descartado: 0 },
    nuevo: 1,
    total: 1,
  })),
  updateTicket: vi.fn(async () => ({ ok: true as const, data: null })),
  addTicketMessage: vi.fn(async () => ({ ok: true as const, data: null })),
  markDuplicate: vi.fn(async () => ({ ok: true as const, data: null })),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: "00000000-0000-4000-8000-000000000001" } })),
}));
vi.mock("@/lib/auth/permissions", () => ({ canManageSupport: () => state.admin }));
vi.mock("@/lib/repositories/support-repository", () => repo);

import {
  addTicketMessageAction,
  listMejorasAction,
  markDuplicateAction,
  mejorasCountsAction,
  updateTicketAction,
} from "./mejoras-actions";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.admin = true;
  vi.clearAllMocks();
});

describe("non-admin", () => {
  beforeEach(() => {
    state.admin = false;
  });

  it("is FORBIDDEN on every action", async () => {
    await expect(listMejorasAction({})).rejects.toThrow("FORBIDDEN");
    await expect(mejorasCountsAction()).rejects.toThrow("FORBIDDEN");
    expect(await updateTicketAction(ID, { status: "resuelto" })).toEqual({ ok: false, error: "FORBIDDEN: soporte" });
    expect(await addTicketMessageAction(ID, { text: "hola", visibility: "public" })).toEqual({
      ok: false,
      error: "FORBIDDEN: soporte",
    });
    expect(await markDuplicateAction(ID, OTHER)).toEqual({ ok: false, error: "FORBIDDEN: soporte" });
    expect(Object.values(repo).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });
});

describe("admin", () => {
  it("lists with the cursor split from the filters", async () => {
    await listMejorasAction({ status: "nuevo", q: "SOL", cursor: "abc" });
    expect(repo.listMejoras).toHaveBeenCalledWith({ status: "nuevo", q: "SOL" }, "abc");
  });

  it("rejects unknown filters and bad ids", async () => {
    await expect(listMejorasAction({ status: "otro" } as never)).rejects.toThrow("INVALID");
    expect(await updateTicketAction("nope", { status: "resuelto" })).toEqual({ ok: false, error: "INVALID" });
    expect(await markDuplicateAction(ID, "nope")).toEqual({ ok: false, error: "INVALID" });
  });

  it("passes the counts filters through", async () => {
    const counts = await mejorasCountsAction({ kind: "error" });
    expect(counts.nuevo).toBe(1);
    expect(repo.getMejorasCounts).toHaveBeenCalledWith({ kind: "error" });
  });

  it("updates with the actor and returns repository errors as results", async () => {
    expect(await updateTicketAction(ID, { priority: "alta", assigneeId: null })).toEqual({ ok: true, data: null });
    expect(repo.updateTicket).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", ID, {
      priority: "alta",
      assigneeId: null,
    });
    repo.updateTicket.mockResolvedValueOnce({ ok: false, error: "VALIDATION: descartar requiere un mensaje público" } as never);
    expect(await updateTicketAction(ID, { status: "descartado" })).toEqual({
      ok: false,
      error: "VALIDATION: descartar requiere un mensaje público",
    });
  });

  it("validates messages", async () => {
    expect(await addTicketMessageAction(ID, { text: "   ", visibility: "internal" })).toEqual({ ok: false, error: "INVALID" });
    expect(await addTicketMessageAction(ID, { text: "Gracias", visibility: "public" })).toEqual({ ok: true, data: null });
    expect(repo.addTicketMessage).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", ID, {
      text: "Gracias",
      visibility: "public",
    });
  });

  it("marks duplicates", async () => {
    expect(await markDuplicateAction(ID, OTHER)).toEqual({ ok: true, data: null });
    expect(repo.markDuplicate).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", ID, OTHER);
  });
});
