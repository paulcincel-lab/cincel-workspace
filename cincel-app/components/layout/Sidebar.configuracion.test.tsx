// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  pathname: "/configuracion/google",
  access: "Administrador" as string | null,
  canManageWorkflows: true,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => (state.access ? { access: state.access } : null),
}));

vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchTramosNavAction: () => Promise.resolve([]),
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveWorkflowsCapabilities: () => ({ canViewWorkflows: true, canManageWorkflows: state.canManageWorkflows }),
}));

vi.mock("@/components/layout/ThemeToggle", () => ({ ThemeToggle: () => <div /> }));

vi.mock("@/lib/settings/use-general-settings", async () => {
  const { buildDefaultGeneralSettings } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => buildDefaultGeneralSettings() };
});

import Sidebar from "./Sidebar";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("Sidebar — Configuración → Google", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
    window.dispatchEvent(new Event("resize"));
    state.pathname = "/configuracion/google";
    state.access = "Administrador";
    state.canManageWorkflows = true;
  });

  it("lists Google in the Configuración menu for an Administrador", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Google" });
    expect(link.getAttribute("href")).toBe("/configuracion/google");
  });

  it("labels the sidebar header Google on the Google page instead of Perfil", () => {
    render(<Sidebar />);
    expect(screen.queryByText("Perfil")).toBeNull();
    // The header label and the active submenu link both read Google.
    expect(screen.getAllByText("Google").length).toBeGreaterThanOrEqual(2);
  });

  it("hides the Configuración menu, Google included, from non-admins", () => {
    state.access = "Colaborador";
    render(<Sidebar />);
    expect(screen.queryByText("Configuración")).toBeNull();
    expect(screen.queryByRole("link", { name: "Google" })).toBeNull();
  });
});

describe("Sidebar — Configuración → Tramos y fases", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
    window.dispatchEvent(new Event("resize"));
    state.pathname = "/configuracion/general";
    state.access = "Administrador";
    state.canManageWorkflows = true;
  });

  it("links Tramos y fases to /configuracion/tramos and drops Workflows", () => {
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Tramos y fases" });
    expect(link.getAttribute("href")).toBe("/configuracion/tramos");
    expect(screen.queryByRole("link", { name: "Workflows" })).toBeNull();
    // Áreas stays until Phase 3.
    expect(screen.getByRole("link", { name: "Áreas" })).toBeTruthy();
  });

  it("hides Tramos y fases from users without canManageWorkflows", () => {
    state.canManageWorkflows = false;
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Estatus" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Tramos y fases" })).toBeNull();
  });
});
