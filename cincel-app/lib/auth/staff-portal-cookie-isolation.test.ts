// @vitest-environment node
/**
 * A portal cookie is never a staff session (BE §B.7, §B.8 #9). The portal
 * side (staff cookie is not a portal session) is in lib/portal/session.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieValues = vi.hoisted(() => new Map<string, string>());
const findSessionByToken = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieValues.has(name) ? { name, value: cookieValues.get(name) } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
// The saved permission matrix (#971) is read from the DB; these tests run on the defaults.
vi.mock("@/lib/auth/permissions-matrix", () => ({ getRolePermissionOverrides: async () => undefined }));
vi.mock("@/lib/repositories/auth-repository", () => ({ findSessionByToken, deleteStaffSessions: vi.fn() }));

import { getSession, getSessionAccess, requireSession } from "./session";
import { PORTAL_SESSION_COOKIE, SESSION_COOKIE } from "./session-cookie";

beforeEach(() => {
  cookieValues.clear();
  findSessionByToken.mockReset();
});

describe("staff session helpers with only a portal cookie", () => {
  it("uses distinct cookie names", () => {
    expect(PORTAL_SESSION_COOKIE).toBe("cincel_portal_session");
    expect(SESSION_COOKIE).not.toBe(PORTAL_SESSION_COOKIE);
  });

  it("treat the request as no session and never look the portal token up", async () => {
    cookieValues.set(PORTAL_SESSION_COOKIE, "portal-token");
    expect(await getSession()).toBeNull();
    expect(await getSessionAccess()).toEqual({ status: "guest", user: null });
    await expect(requireSession()).rejects.toThrow("UNAUTHENTICATED");
    expect(findSessionByToken).not.toHaveBeenCalled();
  });

  it("a portal token copied into the staff cookie matches no staff session", async () => {
    cookieValues.set(SESSION_COOKIE, "portal-token");
    findSessionByToken.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
    expect(findSessionByToken).toHaveBeenCalledWith("portal-token");
  });
});
