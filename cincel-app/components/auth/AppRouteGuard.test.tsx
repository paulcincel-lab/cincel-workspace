// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { SessionAccess } from "@/lib/auth/session";

const nav = vi.hoisted(() => ({
  pathname: "/dashboard",
  replace: vi.fn(),
  refresh: vi.fn(),
}));
const session = vi.hoisted(() => ({ value: { status: "guest", user: null } as SessionAccess }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh }),
}));

vi.mock("@/lib/auth/session-context", () => ({
  useSessionAccess: () => session.value,
}));

import AppRouteGuard from "./AppRouteGuard";

const assign = vi.fn();

function activeUser(access = "Colaborador"): SessionAccess["user"] {
  return { id: "staff-1", name: "Prueba", email: "prueba@example.test", active: true, access } as SessionAccess["user"];
}

function renderAt(pathname: string, value: SessionAccess) {
  nav.pathname = pathname;
  session.value = value;
  return render(
    <AppRouteGuard>
      <p>contenido</p>
    </AppRouteGuard>,
  );
}

beforeEach(() => {
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

  it("moves an active session away from /login to /dashboard", () => {
    renderAt("/login", { status: "active", user: activeUser() });

    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
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

    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
  });
});
