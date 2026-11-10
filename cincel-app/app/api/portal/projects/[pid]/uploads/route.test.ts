// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/portal/projects/[pid]/uploads with the real session helpers over a
 * fake session store: 401 without a portal session, 404 without access, and
 * the listing always scoped to the caller and the project.
 */

const PID = "11111111-1111-4111-8111-111111111111";
const OTHER_PID = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  user: null as null | { id: string; name: string; email: string; contactId: string; companyName: string | null },
  access: new Set<string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock("@/lib/portal/session-store", () => ({
  PORTAL_SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  PORTAL_SESSION_REFRESH_MS: 24 * 60 * 60 * 1000,
  hashPortalToken: (token: string) => `hash:${token}`,
  newPortalToken: () => "token",
  insertPortalSession: vi.fn(),
  deletePortalSessionByTokenHash: vi.fn(),
  slidePortalSession: vi.fn(),
  findActivePortalSession: vi.fn(async () =>
    state.user ? { sessionId: "s1", expiresAt: new Date(Date.now() + 1e9), refreshedAt: new Date(), user: state.user }
      : null),
  findPortalProjectAccess: vi.fn(async (portalUserId: string, projectId: string) =>
    state.access.has(`${portalUserId}:${projectId}`)
      ? { accessId: "a1", projectId, name: "Casa", code: null, status: "activo", managerId: null, coordinatorId: null,
        driveFolderStatus: "ready", driveClientFolderId: "c", driveInboundFolderId: "i" }
      : null),
}));

const listOwnPortalUploads = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal/uploads", () => ({ listOwnPortalUploads }));

const { GET } = await import("./route");

function call(pid: string) {
  return GET(new Request(`http://localhost/api/portal/projects/${pid}/uploads`) as never, {
    params: Promise.resolve({ pid }),
  });
}

describe("GET /api/portal/projects/[pid]/uploads", () => {
  beforeEach(() => {
    state.cookie = "tok";
    state.user = { id: "u-me", name: "Yo", email: "yo@cliente.example", contactId: "c-1", companyName: null };
    state.access = new Set([`u-me:${PID}`]);
    listOwnPortalUploads.mockReset();
    listOwnPortalUploads.mockResolvedValue([
      { id: "e2", fileName: "fotos.zip", sizeBytes: null, at: "2026-10-02T10:00:00.000Z" },
      { id: "e1", fileName: "planos.pdf", sizeBytes: 1200, at: "2026-10-01T10:00:00.000Z" },
    ]);
  });

  it("returns the caller's own uploads for the project", async () => {
    const res = await call(PID);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.json()).toEqual([
      { id: "e2", fileName: "fotos.zip", sizeBytes: null, at: "2026-10-02T10:00:00.000Z" },
      { id: "e1", fileName: "planos.pdf", sizeBytes: 1200, at: "2026-10-01T10:00:00.000Z" },
    ]);
    expect(listOwnPortalUploads).toHaveBeenCalledExactlyOnceWith("u-me", PID);
  });

  it("answers 401 with a redirect and clears the cookie without a portal session", async () => {
    state.cookie = undefined;
    const res = await call(PID);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ redirect: "/portal/login" });
    expect(res.headers.get("set-cookie")).toContain("cincel_portal_session=");
    expect(listOwnPortalUploads).not.toHaveBeenCalled();
  });

  it("answers 401 when the session is unknown or expired", async () => {
    state.user = null;
    expect((await call(PID)).status).toBe(401);
    expect(listOwnPortalUploads).not.toHaveBeenCalled();
  });

  it("answers 404, not 403, for a project the caller has no access to", async () => {
    const res = await call(OTHER_PID);
    expect(res.status).toBe(404);
    expect(listOwnPortalUploads).not.toHaveBeenCalled();
  });

  it("answers 404 for a malformed project id", async () => {
    expect((await call("not-a-uuid")).status).toBe(404);
    expect(listOwnPortalUploads).not.toHaveBeenCalled();
  });

  it("never lists for another portal user even on a shared project", async () => {
    state.user = { id: "u-otro", name: "Otro", email: "otro@cliente.example", contactId: "c-2", companyName: null };
    state.access.add(`u-otro:${PID}`);
    await call(PID);
    expect(listOwnPortalUploads).toHaveBeenCalledExactlyOnceWith("u-otro", PID);
  });
});
