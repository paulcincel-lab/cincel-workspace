// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findSessionByToken = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session-token" }) }) }));
vi.mock("@/lib/repositories/auth-repository", () => ({ findSessionByToken }));

import type { SessionUser } from "@/lib/repositories/auth-repository";

import { getSessionAccess } from "./session";

function sessionFor(user: Partial<SessionUser>) {
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
  };
}

beforeEach(() => findSessionByToken.mockReset());

describe("getSessionAccess", () => {
  it("keeps pending_first_access for password staff who must change their password", async () => {
    findSessionByToken.mockResolvedValue(sessionFor({ mustChangePassword: true }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "pending_first_access" });
  });

  it("never returns pending_first_access for staff with a google_sub", async () => {
    findSessionByToken.mockResolvedValue(sessionFor({ mustChangePassword: true, googleLinked: true }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active", user: { id: "staff-1" } });
  });

  it("returns active for Google staff without password state", async () => {
    findSessionByToken.mockResolvedValue(sessionFor({ googleLinked: true }));
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active" });
  });
});
