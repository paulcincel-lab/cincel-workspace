// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  user: { member: { id: "11111111-1111-4111-8111-111111111111" }, access: "Colaborador" as string },
  repo: {
    createTicket: vi.fn(),
    listMyTickets: vi.fn(),
    getTicket: vi.fn(),
    addAuthorReply: vi.fn(),
    withdrawTicket: vi.fn(),
    listSupportAdminIds: vi.fn(),
  },
  notify: vi.fn(),
  isAdmin: { value: false },
}));

vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: async () => hoisted.user }));
vi.mock("@/lib/auth/permissions", () => ({ canManageSupport: () => hoisted.isAdmin.value }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/notifications/notify", () => ({ notify: hoisted.notify }));
vi.mock("@/lib/repositories/support-repository", () => hoisted.repo);

import {
  createTicketAction,
  getTicketAction,
  listMyTicketsAction,
  replyTicketAction,
  withdrawTicketAction,
} from "@/lib/actions/soporte-actions";

const TICKET_ID = "22222222-2222-4222-8222-222222222222";
const context = { path: "/tareas/abc?x=1", estilo: "visual", theme: "azul", viewport: "1280x800", userAgent: "UA" };
const draft = { kind: "error" as const, title: "Falla al guardar", description: "No guarda", steps: "1. Abrir", context };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.isAdmin.value = false;
  hoisted.repo.createTicket.mockResolvedValue({ ok: true, data: { id: TICKET_ID, code: "SOL-0001" } });
  hoisted.repo.listSupportAdminIds.mockResolvedValue(["admin-1"]);
  hoisted.repo.addAuthorReply.mockResolvedValue({ ok: true, data: null });
  hoisted.repo.withdrawTicket.mockResolvedValue({ ok: true, data: null });
  hoisted.repo.listMyTickets.mockResolvedValue({ rows: [], nextCursor: null });
  hoisted.notify.mockResolvedValue({ created: 1 });
});

describe("createTicketAction", () => {
  it("derives the area, adds the app version and notifies the admins", async () => {
    const result = await createTicketAction(draft);
    expect(result).toEqual({ ok: true, data: { id: TICKET_ID, code: "SOL-0001" } });
    const [staffId, input] = hoisted.repo.createTicket.mock.calls[0];
    expect(staffId).toBe(hoisted.user.member.id);
    expect(input).toMatchObject({ area: "tareas", kind: "error", appVersion: expect.any(String) });
    expect(hoisted.notify).toHaveBeenCalledWith(
      expect.anything(),
      ["admin-1"],
      expect.objectContaining({ kind: "sistema", dedupeKey: `soporte.nueva:${TICKET_ID}`, actorId: hoisted.user.member.id }),
    );
  });

  it("still succeeds when the notice fails", async () => {
    hoisted.notify.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await createTicketAction(draft)).ok).toBe(true);
  });

  it("rejects an invalid draft before touching the database", async () => {
    const result = await createTicketAction({ ...draft, title: "abc" });
    expect(result.ok).toBe(false);
    expect(hoisted.repo.createTicket).not.toHaveBeenCalled();
  });

  it("returns RATE_LIMITED after 10 in an hour", async () => {
    hoisted.user.member.id = "33333333-3333-4333-8333-333333333333";
    for (let i = 0; i < 10; i += 1) expect((await createTicketAction(draft)).ok).toBe(true);
    expect(await createTicketAction(draft)).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(hoisted.repo.createTicket).toHaveBeenCalledTimes(10);
    hoisted.user.member.id = "11111111-1111-4111-8111-111111111111";
  });
});

describe("listMyTicketsAction", () => {
  it("lists for the caller only and keeps just the status filter", async () => {
    await listMyTicketsAction({ status: "abiertas", kind: "error", authorId: "44444444-4444-4444-8444-444444444444", cursor: "c" });
    expect(hoisted.repo.listMyTickets).toHaveBeenCalledWith(hoisted.user.member.id, { status: "abiertas" }, "c");
  });
});

describe("getTicketAction", () => {
  it("passes the viewer and its capability", async () => {
    hoisted.repo.getTicket.mockResolvedValue(null);
    hoisted.isAdmin.value = true;
    expect(await getTicketAction(TICKET_ID)).toBeNull();
    expect(hoisted.repo.getTicket).toHaveBeenCalledWith({ staffId: hoisted.user.member.id, canManageSupport: true }, TICKET_ID);
  });

  it("returns null for a malformed id without querying", async () => {
    expect(await getTicketAction("nope")).toBeNull();
    expect(hoisted.repo.getTicket).not.toHaveBeenCalled();
  });
});

describe("replyTicketAction and withdrawTicketAction", () => {
  it("replies as the caller", async () => {
    expect(await replyTicketAction(TICKET_ID, "  Gracias  ")).toEqual({ ok: true, data: null });
    expect(hoisted.repo.addAuthorReply).toHaveBeenCalledWith(hoisted.user.member.id, TICKET_ID, "Gracias");
  });

  it("surfaces NOT_FOUND for somebody else's ticket", async () => {
    hoisted.repo.addAuthorReply.mockResolvedValue({ ok: false, error: "NOT_FOUND" });
    expect(await replyTicketAction(TICKET_ID, "hola")).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects an empty reply", async () => {
    expect((await replyTicketAction(TICKET_ID, "   ")).ok).toBe(false);
    expect(hoisted.repo.addAuthorReply).not.toHaveBeenCalled();
  });

  it("withdraws as the caller and returns the repository error", async () => {
    expect(await withdrawTicketAction(TICKET_ID)).toEqual({ ok: true, data: null });
    hoisted.repo.withdrawTicket.mockResolvedValue({ ok: false, error: "Solo puedes retirar una solicitud nueva." });
    expect(await withdrawTicketAction(TICKET_ID)).toEqual({ ok: false, error: "Solo puedes retirar una solicitud nueva." });
  });
});
