// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import type { SessionAccess } from "@/lib/auth/session";

const nav = vi.hoisted(() => ({
  pathname: "/dashboard",
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh }),
}));

import { resetSessionStoreForTests, useSessionStore } from "@/lib/stores/session-store";
import AppRouteGuard from "./AppRouteGuard";
import SessionHydrator from "./SessionHydrator";

const assign = vi.fn();

function activeUser(access = "Colaborador"): SessionAccess["user"] {
  return { id: "staff-1", name: "Prueba", email: "prueba@example.test", active: true, access } as SessionAccess["user"];
}

function renderAt(pathname: string, value: SessionAccess) {
  nav.pathname = pathname;
  useSessionStore.getState().setAccess(value);
  return render(
    <AppRouteGuard>
      <p>contenido</p>
    </AppRouteGuard>,
  );
}

beforeEach(() => {
  resetSessionStoreForTests();
  nav.replace.mockReset();
  nav.refresh.mockReset();
  assign.mockReset();
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, assign } as Location);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AppRouteGuard", () => {
  it("sends a guest (stale cookie) on a protected path through sign-out, not straight to /login", () => {
    renderAt("/dashboard", { status: "guest", user: null });

    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/api/auth/signout?next=%2Flogin");
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("contenido")).toBeNull();
  });

  it("renders /login for a guest without redirecting (no loop after sign-out)", () => {
    renderAt("/login", { status: "guest", user: null });

    expect(screen.getByText("contenido")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it.each(["/login/denegado", "/portal", "/portal/login", "/portal/proyectos/abc"])(
    "renders %s without a staff session",
    (path) => {
      renderAt(path, { status: "guest", user: null });

      expect(screen.getByText("contenido")).toBeTruthy();
      expect(assign).not.toHaveBeenCalled();
      expect(nav.replace).not.toHaveBeenCalled();
    },
  );

  it("renders /portal paths without staff checks even for an active staff session", () => {
    renderAt("/portal/proyectos/abc", { status: "active", user: activeUser() });

    expect(screen.getByText("contenido")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("renders a protected path for an active session", () => {
    renderAt("/dashboard", { status: "active", user: activeUser() });

    expect(screen.getByText("contenido")).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("moves an active session away from /login to /inicio", () => {
    renderAt("/login", { status: "active", user: activeUser() });

    expect(nav.replace).toHaveBeenCalledWith("/inicio");
    expect(assign).not.toHaveBeenCalled();
  });

  it("sends must_change_password sessions to /change-password and renders it", () => {
    renderAt("/dashboard", { status: "pending_first_access", user: activeUser() });
    expect(nav.replace).toHaveBeenCalledWith("/change-password");
    cleanup();
    nav.replace.mockReset();

    renderAt("/change-password", { status: "pending_first_access", user: activeUser() });
    expect(screen.getByText("contenido")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("sends a guest on /change-password to /login without signing out", () => {
    renderAt("/change-password", { status: "guest", user: null });

    expect(nav.replace).toHaveBeenCalledWith("/login");
    expect(assign).not.toHaveBeenCalled();
  });

  it("keeps inactive members on the client redirect to /login", () => {
    renderAt("/dashboard", { status: "inactive_member", user: null });

    expect(nav.replace).toHaveBeenCalledWith("/login");
    expect(assign).not.toHaveBeenCalled();
  });

  it("redirects a non-admin away from /configuracion", () => {
    renderAt("/configuracion", { status: "active", user: activeUser() });

    expect(nav.replace).toHaveBeenCalledWith("/inicio");
  });

  it("keeps /configuracion/google for Administrador only", () => {
    const view = renderAt("/configuracion/google", { status: "active", user: activeUser() });
    expect(screen.queryByText("contenido")).toBeNull();
    expect(nav.replace).toHaveBeenCalledWith("/inicio");
    view.unmount();

    renderAt("/configuracion/google", { status: "active", user: activeUser("Administrador") });
    expect(screen.getByText("contenido")).toBeTruthy();
  });

  it.each(["/ajustes/apariencia", "/ajustes/permisos", "/ajustes/general"])(
    "leaves %s to its server segment guard (no client prefix check)",
    (path) => {
      renderAt(path, { status: "active", user: activeUser() });

      expect(screen.getByText("contenido")).toBeTruthy();
      expect(nav.replace).not.toHaveBeenCalled();
    },
  );

  it("follows the session store: a guest that signs in is let through without a sign-out", () => {
    renderAt("/login", { status: "guest", user: null });
    expect(screen.getByText("contenido")).toBeTruthy();

    act(() => useSessionStore.getState().setAccess({ status: "active", user: activeUser() }));
    expect(nav.replace).toHaveBeenCalledWith("/inicio");
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not sign out when the hydrator stores the new session in the same commit", () => {
    // The guard renders with the previous (guest) session on a protected
    // path; SessionHydrator's layout effect stores the new one before the
    // guard's redirect effect, which re-checks the store and does nothing.
    nav.pathname = "/dashboard";
    render(
      <>
        <SessionHydrator value={{ status: "active", user: activeUser() }} />
        <AppRouteGuard>
          <p>contenido</p>
        </AppRouteGuard>
      </>,
    );
    expect(assign).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(screen.getByText("contenido")).toBeTruthy();
  });
});
