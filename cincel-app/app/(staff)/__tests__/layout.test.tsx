// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedAppearance, TodayStatus } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getSessionAccess: vi.fn(),
  getResolvedAppearance: vi.fn(),
  buildNavModel: vi.fn(),
  fetchMyTodayAction: vi.fn(),
  clockInAction: vi.fn(),
  findStaffPhoto: vi.fn(),
  appShellProps: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: mocks.getSessionAccess }));
vi.mock("@/lib/ui/preferences-server", () => ({ getResolvedAppearance: mocks.getResolvedAppearance }));
vi.mock("@/lib/ui/nav", () => ({ buildNavModel: mocks.buildNavModel }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({
  fetchMyTodayAction: mocks.fetchMyTodayAction,
  clockInAction: mocks.clockInAction,
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/repositories/preferences-repository", () => ({ findStaffPhoto: mocks.findStaffPhoto }));

// The real shell reads actions and settings; this stand-in keeps one landmark.
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: (props: { children: ReactNode }) => {
    mocks.appShellProps(props);
    return (
      <div data-testid="app-shell">
        <nav data-testid="sidebar" aria-label="Navegación" />
        <div>{props.children}</div>
      </div>
    );
  },
}));

import StaffLayout from "../layout";

const ACTIVE_USER = {
  id: "staff-1",
  name: "Ana López",
  email: "ana@cincel.mx",
  role: "Diseño",
  area: null,
  active: true,
  mustChangePassword: false,
  googleLinked: true,
  access: "Colaborador",
};

function appearance(): ResolvedAppearance {
  return {
    theme: "azul",
    mode: "light",
    style: "visual",
    density: "comoda",
    textSize: 14,
    cssVars: { light: {}, dark: {} },
    version: 1,
  };
}

const DISABLED_TODAY: TodayStatus = {
  state: "off",
  startedAt: null,
  workedSeconds: 0,
  required: false,
  promptAtLogin: false,
  enabled: false,
  requiredFrom: null,
  hoursPerDay: 8,
};

const NAV = { items: [], tramos: [], footer: [] };

async function renderLayout(children: ReactNode) {
  return render(await StaffLayout({ children }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionAccess.mockResolvedValue({ status: "active", user: ACTIVE_USER });
  mocks.getResolvedAppearance.mockResolvedValue(appearance());
  mocks.buildNavModel.mockResolvedValue(NAV);
  mocks.fetchMyTodayAction.mockResolvedValue(DISABLED_TODAY);
  mocks.findStaffPhoto.mockResolvedValue(null);
});

afterEach(() => cleanup());

describe("app/(staff)/layout", () => {
  it("redirects to /login without a session", async () => {
    mocks.getSessionAccess.mockResolvedValue({ status: "guest", user: null });
    await expect(StaffLayout({ children: <p>Contenido</p> })).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.getResolvedAppearance).not.toHaveBeenCalled();
  });

  it("renders AppShell around the page for every active session", async () => {
    await renderLayout(<p>Contenido</p>);
    expect(screen.getByTestId("app-shell")).toBeTruthy();
    expect(screen.getByText("Contenido")).toBeTruthy();
    expect(screen.getAllByTestId("sidebar")).toHaveLength(1);

    const props = mocks.appShellProps.mock.calls[0][0];
    expect(props.session).toEqual({
      staffId: "staff-1",
      name: "Ana López",
      role: "Diseño",
      isAdmin: false,
      photoUrl: null,
    });
    expect(props.nav).toEqual(NAV);
    expect(props.appearance).toEqual(appearance());
    // Time tracking disabled: the sidebar clock stays hidden.
    expect(props.today).toBeNull();
    expect(mocks.buildNavModel).toHaveBeenCalledWith(props.session);
  });

  it("passes the admin flag, the photo url and an enabled day to AppShell", async () => {
    mocks.getSessionAccess.mockResolvedValue({ status: "active", user: { ...ACTIVE_USER, access: "Administrador" } });
    mocks.findStaffPhoto.mockResolvedValue({ staffId: "staff-1", mime: "image/jpeg", sha256: "abcdef0123456789" });
    const today = { ...DISABLED_TODAY, enabled: true, required: true };
    mocks.fetchMyTodayAction.mockResolvedValue(today);

    await renderLayout(<p>Contenido</p>);
    const props = mocks.appShellProps.mock.calls[0][0];
    expect(props.session.isAdmin).toBe(true);
    expect(props.session.photoUrl).toBe("/api/staff/staff-1/photo?v=abcdef01");
    expect(props.today).toEqual(today);
  });

  it("still renders the shell when the nav, the day or the photo cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.buildNavModel.mockRejectedValue(new Error("db down"));
    mocks.fetchMyTodayAction.mockRejectedValue(new Error("db down"));
    mocks.findStaffPhoto.mockRejectedValue(new Error("db down"));

    await renderLayout(<p>Contenido</p>);
    const props = mocks.appShellProps.mock.calls[0][0];
    expect(props.nav).toEqual(NAV);
    expect(props.today).toBeNull();
    expect(props.session.photoUrl).toBeNull();
    expect(screen.getByText("Contenido")).toBeTruthy();
  });

  it("renders a first-access session bare (the route guard moves it on)", async () => {
    mocks.getSessionAccess.mockResolvedValue({ status: "pending_first_access", user: ACTIVE_USER });
    await renderLayout(<p>Contenido</p>);
    expect(screen.getByText("Contenido")).toBeTruthy();
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(mocks.getResolvedAppearance).not.toHaveBeenCalled();
  });

  it("calls no write action while rendering", async () => {
    await renderLayout(<p>Contenido</p>);
    expect(mocks.clockInAction).not.toHaveBeenCalled();
  });
});
