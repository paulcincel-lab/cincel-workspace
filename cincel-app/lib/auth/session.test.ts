// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findSessionByToken = vi.hoisted(() => vi.fn());
const deleteStaffSessions = vi.hoisted(() => vi.fn());
const recheckStaffAccess = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/repositories/auth-repository", () => ({ findSessionByToken, deleteStaffSessions }));
vi.mock("@/lib/auth/access-recheck", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/access-recheck")>()),
  recheckStaffAccess,
}));

import type { SessionStaffAccess, SessionUser } from "@/lib/repositories/auth-repository";

import {
  getSessionAccess,
  requireCapabilityUser,
  requireSession,
  requireSessionAccess,
  SIGNOUT_INACTIVE_PATH,
  SIGNOUT_REVOKED_PATH,
} from "./session";

const HOUR = 3_600_000;

function sessionFor(user: Partial<SessionUser>, staffAccess: Partial<SessionStaffAccess> = {}) {
  return {
    id: "session-1",
    expiresAt: new Date(Date.now() + 60_000),
    user: {
      id: "staff-1",
      name: "Ana",
      email: "ana@cincel.example",
      role: "Arquitecto Senior",
      area: null,
      active: true,
      mustChangePassword: false,
      googleLinked: false,
      ...user,
    },
    staffAccess: { googleSub: null, accessCheckedAt: null, accessRevokedAt: null, ...staffAccess },
  };
}

const google = (staffAccess: Partial<SessionStaffAccess>, user: Partial<SessionUser> = {}) =>
  sessionFor({ googleLinked: true, ...user }, { googleSub: "sub-1", ...staffAccess });

beforeEach(() => {
  findSessionByToken.mockReset();
  deleteStaffSessions.mockReset();
  recheckStaffAccess.mockReset();
  delete process.env.ACCESS_RECHECK_HOURS;
});

describe("getSessionAccess", () => {
  it("keeps pending_first_access for password staff who must change their password", async () => {
    findSessionByToken.mockResolvedValue(sessionFor({ mustChangePassword: true }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "pending_first_access" });
  });

  it("never returns pending_first_access for staff with a google_sub", async () => {
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: new Date() }, { mustChangePassword: true }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active", user: { id: "staff-1" } });
  });

  it("returns active for Google staff without password state", async () => {
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: new Date() }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active" });
  });
});

describe("access re-check in the session helpers", () => {
  const helpers = [
    ["getSessionAccess", getSessionAccess],
    ["requireSession", requireSession],
    ["requireSessionAccess", requireSessionAccess],
    ["requireCapabilityUser", requireCapabilityUser],
  ] as const;

  it.each(helpers)("%s signs out staff whose access was revoked", async (_, helper) => {
    findSessionByToken.mockResolvedValue(google({ accessRevokedAt: new Date() }));
    await expect(helper()).rejects.toThrow(`NEXT_REDIRECT ${SIGNOUT_REVOKED_PATH}`);
    expect(deleteStaffSessions).toHaveBeenCalledWith("staff-1");
    expect(recheckStaffAccess).not.toHaveBeenCalled();
  });

  it.each(helpers)("%s signs out deactivated staff", async (_, helper) => {
    findSessionByToken.mockResolvedValue(sessionFor({ active: false }));
    await expect(helper()).rejects.toThrow(`NEXT_REDIRECT ${SIGNOUT_INACTIVE_PATH}`);
    expect(deleteStaffSessions).toHaveBeenCalledWith("staff-1");
  });

  it.each(helpers)("%s re-checks a due Google staff member and signs out on revoke", async (_, helper) => {
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: new Date(Date.now() - 5 * HOUR) }));
    recheckStaffAccess.mockResolvedValue({ status: "revoked", reason: "no_role_group" });
    await expect(helper()).rejects.toThrow(`NEXT_REDIRECT ${SIGNOUT_REVOKED_PATH}`);
    expect(recheckStaffAccess).toHaveBeenCalledWith("staff-1");
  });

  it("sends a revoked user to the encoded denial page", () => {
    expect(SIGNOUT_REVOKED_PATH).toBe("/api/auth/signout?next=%2Flogin%2Fdenegado%3Fmotivo%3Drevoked");
    expect(decodeURIComponent(SIGNOUT_REVOKED_PATH.split("next=")[1])).toBe("/login/denegado?motivo=revoked");
  });

  it("does not call the re-check before the interval", async () => {
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: new Date(Date.now() - 3 * HOUR) }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active" });
    expect(recheckStaffAccess).not.toHaveBeenCalled();
  });

  it("reads ACCESS_RECHECK_HOURS", async () => {
    process.env.ACCESS_RECHECK_HOURS = "1";
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: new Date(Date.now() - 2 * HOUR) }));
    recheckStaffAccess.mockResolvedValue({ status: "not_claimed" });
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active" });
    expect(recheckStaffAccess).toHaveBeenCalledOnce();
  });

  it("never re-checks staff without google_sub", async () => {
    findSessionByToken.mockResolvedValue(sessionFor({ role: "Administrador" }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active" });
    expect(recheckStaffAccess).not.toHaveBeenCalled();
  });

  it("keeps access on a Directory error", async () => {
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: null }));
    recheckStaffAccess.mockResolvedValue({ status: "error", error: new Error("down") });
    await expect(requireSessionAccess()).resolves.toMatchObject({ id: "staff-1" });
    expect(deleteStaffSessions).not.toHaveBeenCalled();
  });

  it("keeps access when the re-check throws unexpectedly", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findSessionByToken.mockResolvedValue(google({ accessCheckedAt: null }));
    recheckStaffAccess.mockRejectedValue(new Error("db down"));
    await expect(requireSession()).resolves.toMatchObject({ id: "session-1" });
  });

  it("reloads the session after a kept re-check so a new role applies", async () => {
    findSessionByToken
      .mockResolvedValueOnce(google({ accessCheckedAt: null }))
      .mockResolvedValueOnce(google({ accessCheckedAt: new Date() }, { role: "Dirección" }));
    recheckStaffAccess.mockResolvedValue({ status: "kept" });
    await expect(requireSessionAccess()).resolves.toMatchObject({ role: "Dirección" });
  });
});
