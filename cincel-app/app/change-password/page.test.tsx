// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { SessionAccess } from "@/lib/auth/session";

const session = vi.hoisted(() => ({
  value: { status: "guest", user: null } as SessionAccess,
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: async () => session.value,
}));
vi.mock("@/lib/auth/auth-actions", () => ({
  completeFirstAccessAction: vi.fn(),
}));

import ChangePasswordPage from "./page";

function setPasswordFlag(value: string | undefined) {
  if (value === undefined) delete process.env.AUTH_PASSWORD_ENABLED;
  else process.env.AUTH_PASSWORD_ENABLED = value;
}

describe("/change-password", () => {
  const original = process.env.AUTH_PASSWORD_ENABLED;

  beforeEach(() => {
    redirect.mockClear();
  });

  afterEach(() => {
    cleanup();
    setPasswordFlag(original);
  });

  it("renders the form for pending_first_access with passwords on (default)", async () => {
    setPasswordFlag(undefined);
    session.value = {
      status: "pending_first_access",
      user: { id: "staff-1" },
    } as SessionAccess;
    render(await ChangePasswordPage());
    expect(
      screen.getByRole("button", { name: "Guardar y continuar" }),
    ).not.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("clears a pending_first_access session when passwords are off", async () => {
    setPasswordFlag("false");
    session.value = {
      status: "pending_first_access",
      user: { id: "staff-1" },
    } as SessionAccess;
    await expect(ChangePasswordPage()).rejects.toThrow(
      "NEXT_REDIRECT /api/auth/signout?next=%2Flogin",
    );
  });

  it.each(["true", "false"])(
    "redirects an active session to /dashboard (passwords %s)",
    async (flag) => {
      setPasswordFlag(flag);
      session.value = {
        status: "active",
        user: { id: "staff-1" },
      } as SessionAccess;
      await expect(ChangePasswordPage()).rejects.toThrow(
        "NEXT_REDIRECT /dashboard",
      );
    },
  );

  it.each(["guest", "inactive_member", "no_system_access"] as const)(
    "redirects %s to /login",
    async (status) => {
      setPasswordFlag(undefined);
      session.value = { status, user: null } as SessionAccess;
      await expect(ChangePasswordPage()).rejects.toThrow(
        "NEXT_REDIRECT /login",
      );
    },
  );
});
