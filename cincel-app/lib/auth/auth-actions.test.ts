// @vitest-environment node
/**
 * AUTH_PASSWORD_ENABLED in the password server actions (BE §A.8 step 3): with the
 * flag false they refuse before reading anything, even when called directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authenticate, setOwnPassword, getCredential, createSession, getSession } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setOwnPassword: vi.fn(),
  getCredential: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "vitest" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/repositories/auth-repository", () => ({
  authenticate: (...args: unknown[]) => authenticate(...args),
  setOwnPassword: (...args: unknown[]) => setOwnPassword(...args),
  getCredential: (...args: unknown[]) => getCredential(...args),
}));
vi.mock("@/lib/auth/session", () => ({
  createSession: (...args: unknown[]) => createSession(...args),
  destroySession: vi.fn(),
  getSession: () => getSession(),
}));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: vi.fn(async () => true) }));

import { changePasswordAction, completeFirstAccessAction, loginAction } from "@/lib/auth/auth-actions";

beforeEach(() => {
  vi.clearAllMocks();
  authenticate.mockResolvedValue({ ok: true, staffId: "staff-1", mustChangePassword: false });
  getSession.mockResolvedValue({ user: { id: "staff-1" } });
  getCredential.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AUTH_PASSWORD_ENABLED=false", () => {
  beforeEach(() => vi.stubEnv("AUTH_PASSWORD_ENABLED", "false"));

  it("loginAction refuses without checking the password or creating a session", async () => {
    expect(await loginAction("a@cincel.mx", "whatever")).toEqual({ ok: false, reason: "password_login_disabled" });
    expect(authenticate).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("completeFirstAccessAction refuses without writing a password", async () => {
    expect(await completeFirstAccessAction("new-password", "new-password")).toEqual({
      ok: false,
      reason: "password_login_disabled",
    });
    expect(setOwnPassword).not.toHaveBeenCalled();
  });

  it("changePasswordAction refuses without writing a password", async () => {
    expect(await changePasswordAction("old-password", "new-password", "new-password")).toEqual({
      ok: false,
      reason: "password_login_disabled",
    });
    expect(setOwnPassword).not.toHaveBeenCalled();
  });
});

describe.each([
  ["unset", undefined],
  ["true", "true"],
])("AUTH_PASSWORD_ENABLED %s (default behaviour)", (_label, value) => {
  beforeEach(() => vi.stubEnv("AUTH_PASSWORD_ENABLED", value));

  it("loginAction signs in", async () => {
    expect(await loginAction("a@cincel.mx", "secret-pass")).toEqual({ ok: true, mustChangePassword: false });
    expect(authenticate).toHaveBeenCalledWith("a@cincel.mx", "secret-pass");
    expect(createSession).toHaveBeenCalledWith("staff-1", "vitest");
  });

  it("completeFirstAccessAction sets the password", async () => {
    expect(await completeFirstAccessAction("new-password", "new-password")).toEqual({ ok: true });
    expect(setOwnPassword).toHaveBeenCalledWith("staff-1", "new-password");
  });

  it("changePasswordAction sets the password", async () => {
    expect(await changePasswordAction("old-password", "new-password", "new-password")).toEqual({ ok: true });
    expect(setOwnPassword).toHaveBeenCalledWith("staff-1", "new-password");
  });
});
