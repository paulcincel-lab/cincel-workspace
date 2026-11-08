// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { SessionAccess } from "@/lib/auth/session";

const session = vi.hoisted(() => ({
  value: { status: "guest", user: null } as SessionAccess,
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const completeFirstAccessAction = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => router,
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: async () => session.value,
}));
vi.mock("@/lib/auth/auth-actions", () => ({
  completeFirstAccessAction,
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
    router.replace.mockClear();
    router.refresh.mockClear();
    completeFirstAccessAction.mockReset();
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

  it("renders the split layout with the change-password card", async () => {
    setPasswordFlag(undefined);
    session.value = {
      status: "pending_first_access",
      user: { id: "staff-1" },
    } as SessionAccess;
    render(await ChangePasswordPage());
    expect(screen.getByTestId("auth-split-layout")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Cambia tu contraseña" })).not.toBeNull();
    expect(screen.getByLabelText("Contraseña nueva")).not.toBeNull();
    expect(screen.getByLabelText("Confirmar contraseña nueva")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar y continuar" })).not.toBeNull();
  });

  describe("form submit", () => {
    const nextLabel = "Contraseña nueva";
    const confirmLabel = "Confirmar contraseña nueva";

    beforeEach(() => {
      setPasswordFlag(undefined);
      session.value = {
        status: "pending_first_access",
        user: { id: "staff-1" },
      } as SessionAccess;
    });

    async function fillAndSubmit(next: string, confirm: string) {
      render(await ChangePasswordPage());
      fireEvent.change(screen.getByLabelText(nextLabel), { target: { value: next } });
      fireEvent.change(screen.getByLabelText(confirmLabel), { target: { value: confirm } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
      });
    }

    it.each([
      ["password_too_short", "La nueva contraseña debe tener al menos 8 caracteres."],
      ["password_confirmation_mismatch", "La confirmación no coincide con la nueva contraseña."],
      ["password_login_disabled", "El acceso con contraseña está desactivado. Entra con Google."],
      ["no_session", "Tu sesión expiró. Inicia sesión de nuevo."],
      ["unexpected", "No fue posible completar el primer acceso."],
    ])("shows the %s message and stays on the page", async (reason, message) => {
      completeFirstAccessAction.mockResolvedValue({ ok: false, reason });
      await fillAndSubmit("corta", "otra");
      expect(completeFirstAccessAction).toHaveBeenCalledWith("corta", "otra");
      expect(screen.getByRole("alert").textContent).toContain(message);
      expect(router.replace).not.toHaveBeenCalled();
    });

    it("submits both fields and redirects to /inicio on success", async () => {
      completeFirstAccessAction.mockResolvedValue({ ok: true });
      await fillAndSubmit("Ensenada2026", "Ensenada2026");
      expect(completeFirstAccessAction).toHaveBeenCalledWith("Ensenada2026", "Ensenada2026");
      expect(screen.getByRole("status").textContent).toContain("Contraseña actualizada.");
      expect(router.replace).toHaveBeenCalledWith("/inicio");
      expect(router.refresh).toHaveBeenCalled();
    });
  });
});
