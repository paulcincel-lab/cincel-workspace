// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/query/keys";
import type { TodayStatus } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  getSessionAccess: vi.fn(),
  getResolvedAppearance: vi.fn(),
  buildNavModel: vi.fn(),
  fetchMyTodayAction: vi.fn(),
  clockInAction: vi.fn(),
  getStaffPhotoUrl: vi.fn(),
  loadShellBadges: vi.fn(),
  hydrated: vi.fn(),
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
vi.mock("@/lib/profile-photo/photo-url", () => ({ getStaffPhotoUrl: mocks.getStaffPhotoUrl }));
vi.mock("@/lib/shell/badges", () => ({
  loadShellBadges: mocks.loadShellBadges,
  capabilityUserOf: (user: { id: string; name: string; access: string }) => ({
    member: { id: user.id, name: user.name },
    access: user.access,
  }),
}));
// The boundary hands the shell's cache to the browser; the test reads what it carries.
vi.mock("@/lib/query/hydrate", () => ({
  Hydrate: ({ qc, children }: { qc: QueryClient; children: ReactNode }) => {
    mocks.hydrated(qc);
    return <>{children}</>;
  },
}));

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

const BADGES = { tareasOpen: 4, bandeja: { unreadCount: 2, dueReminders: [], renderedAt: 1 } };

/** The query client the layout hydrated (shell keys only). */
function hydratedClient(): QueryClient {
  return mocks.hydrated.mock.calls[0][0] as QueryClient;
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

const NAV = { items: [], etapas: [], footer: [] };

async function renderLayout(children: ReactNode) {
  return render(await StaffLayout({ children }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionAccess.mockResolvedValue({ status: "active", user: ACTIVE_USER });
  mocks.loadShellBadges.mockResolvedValue(BADGES);
  mocks.buildNavModel.mockResolvedValue(NAV);
  mocks.fetchMyTodayAction.mockResolvedValue(DISABLED_TODAY);
  mocks.getStaffPhotoUrl.mockResolvedValue(null);
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
    // The style comes from the appearance store the root layout seeds.
    expect(props).not.toHaveProperty("appearance");
    expect(mocks.getResolvedAppearance).not.toHaveBeenCalled();
    // Time tracking disabled: the sidebar clock stays hidden.
    expect(props.today).toBeNull();
    // The nav never reads the photo, so it runs next to the photo read.
    expect(mocks.buildNavModel).toHaveBeenCalledWith({ ...props.session, photoUrl: null });
  });

  it("starts the photo, nav, day and badge reads together (one Promise.all)", async () => {
    let releasePhoto: (url: string | null) => void = () => {};
    mocks.getStaffPhotoUrl.mockReturnValue(new Promise((resolve) => (releasePhoto = resolve)));
    const pending = StaffLayout({ children: <p>Contenido</p> });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.buildNavModel).toHaveBeenCalledTimes(1);
    expect(mocks.fetchMyTodayAction).toHaveBeenCalledTimes(1);
    expect(mocks.loadShellBadges).toHaveBeenCalledTimes(1);
    releasePhoto(null);
    render(await pending);
    expect(screen.getByText("Contenido")).toBeTruthy();
  });

  it("hydrates shell.badges, me.profile and me.today for the client, and nothing else", async () => {
    mocks.getStaffPhotoUrl.mockResolvedValue("/api/staff/staff-1/photo?v=abcdef01");
    const today = { ...DISABLED_TODAY, enabled: true };
    mocks.fetchMyTodayAction.mockResolvedValue(today);
    await renderLayout(<p>Contenido</p>);

    expect(mocks.loadShellBadges).toHaveBeenCalledWith(expect.objectContaining({ member: expect.objectContaining({ id: "staff-1" }) }));
    const qc = hydratedClient();
    expect(qc.getQueryData(qk.shell.badges())).toEqual(BADGES);
    expect(qc.getQueryData(qk.me.profile())).toEqual({
      id: "staff-1",
      name: "Ana López",
      photoUrl: "/api/staff/staff-1/photo?v=abcdef01",
    });
    expect(qc.getQueryData(qk.me.today())).toEqual(today);
    expect(qc.getQueryCache().getAll().map((q) => q.queryKey[0]).sort()).toEqual(["me", "me", "shell"]);
  });

  it("seeds a disabled day too (the palette reads it), while the shell gets no clock", async () => {
    await renderLayout(<p>Contenido</p>);
    expect(hydratedClient().getQueryData(qk.me.today())).toEqual(DISABLED_TODAY);
    expect(mocks.appShellProps.mock.calls[0][0].today).toBeNull();
  });

  it("passes the admin flag, the photo url and an enabled day to AppShell", async () => {
    mocks.getSessionAccess.mockResolvedValue({ status: "active", user: { ...ACTIVE_USER, access: "Administrador" } });
    mocks.getStaffPhotoUrl.mockResolvedValue("/api/staff/staff-1/photo?v=abcdef01");
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
    mocks.getStaffPhotoUrl.mockRejectedValue(new Error("db down"));

    await renderLayout(<p>Contenido</p>);
    const props = mocks.appShellProps.mock.calls[0][0];
    expect(props.nav).toEqual(NAV);
    expect(props.today).toBeNull();
    expect(props.session.photoUrl).toBeNull();
    expect(screen.getByText("Contenido")).toBeTruthy();
    expect(hydratedClient().getQueryData(qk.me.today())).toBeUndefined();
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
