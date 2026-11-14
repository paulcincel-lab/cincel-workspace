// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  file: null as { mime: string; name: string; bytes: Uint8Array } | null,
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: vi.fn(async () => ({ user: state.user, status: state.user ? "ok" : "unauthenticated" })),
  requireCapabilityUser: vi.fn(async () => ({ member: { id: "u1" }, access: "Colaborador" })),
}));
vi.mock("@/lib/auth/permissions", () => ({ canManageSupport: () => false }));
vi.mock("@/lib/soporte/flags", () => ({ SOPORTE_ENABLED: true }));
vi.mock("@/lib/soporte/attachments", () => ({ readTicketAttachment: vi.fn(async () => state.file) }));

import { GET } from "./route";

const ID = "22222222-2222-4222-8222-222222222222";
const call = (id: string) => GET(new Request("http://x") as never, { params: Promise.resolve({ id }) });

describe("GET /api/soporte/adjuntos/[id]", () => {
  beforeEach(() => {
    state.user = { id: "u1" };
    state.file = { mime: "image/png", name: "a.png", bytes: new Uint8Array([1, 2]) };
  });

  it("401 without a session", async () => {
    state.user = null;
    expect((await call(ID)).status).toBe(401);
  });

  it("404 for a malformed id and for an attachment the viewer can't see", async () => {
    expect((await call("nope")).status).toBe(404);
    state.file = null;
    expect((await call(ID)).status).toBe(404);
  });

  it("serves the image privately", async () => {
    const res = await call(ID);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("private");
  });
});
