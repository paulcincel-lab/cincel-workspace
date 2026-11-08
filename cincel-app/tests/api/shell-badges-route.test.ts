// @vitest-environment node
/**
 * GET /api/shell/badges (plan §4.3 Shell, decision D5): the same capability
 * check as the `(staff)` layout (an active staff session), `Cache-Control:
 * private, no-store` on every answer, and the caller's own counts only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionAccess } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  getSessionAccess: vi.fn(),
  loadShellBadges: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionAccess: mocks.getSessionAccess }));
vi.mock("@/lib/shell/badges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shell/badges")>()),
  loadShellBadges: mocks.loadShellBadges,
}));

import { GET } from "@/app/api/shell/badges/route";

const USER = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "Ana López",
  email: "ana@cincel.mx",
  role: "Diseño",
  area: null,
  active: true,
  mustChangePassword: false,
  googleLinked: true,
  access: "Colaborador",
} as const;

const BADGES = { tareasOpen: 3, bandeja: { unreadCount: 2, dueReminders: [], renderedAt: 1 } };

function access(status: SessionAccess["status"], user: SessionAccess["user"] = USER): SessionAccess {
  return { status, user };
}

beforeEach(() => {
  mocks.getSessionAccess.mockReset();
  mocks.loadShellBadges.mockReset().mockResolvedValue(BADGES);
});

describe("GET /api/shell/badges", () => {
  it("answers 401 without a session (a portal-only cookie is no staff session)", async () => {
    mocks.getSessionAccess.mockResolvedValue({ status: "guest", user: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
    expect(mocks.loadShellBadges).not.toHaveBeenCalled();
  });

  it.each(["no_system_access", "pending_first_access", "inactive_member"] as const)(
    "answers 403 for a %s session, like the layout that renders no shell for it",
    async (status) => {
      mocks.getSessionAccess.mockResolvedValue(access(status, status === "no_system_access" ? null : USER));
      const res = await GET();
      expect(res.status).toBe(403);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(await res.json()).toEqual({ error: "FORBIDDEN" });
      expect(mocks.loadShellBadges).not.toHaveBeenCalled();
    },
  );

  it("answers 200 with the caller's badges and the private no-store header", async () => {
    mocks.getSessionAccess.mockResolvedValue(access("active"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual(BADGES);
  });

  it("counts for the session user only, never an input", async () => {
    mocks.getSessionAccess.mockResolvedValue(access("active"));
    await GET();
    expect(mocks.loadShellBadges).toHaveBeenCalledTimes(1);
    const [user] = mocks.loadShellBadges.mock.calls[0];
    expect(user).toMatchObject({ member: { id: USER.id, name: USER.name }, access: "Colaborador" });
  });

  it("takes no request: GET() has no parameters to read", () => {
    expect(GET.length).toBe(0);
  });
});
