// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BookOpen, Folder, House, Inbox, SlidersHorizontal, Sparkles, SquareCheck, Users } from "lucide-react";

const state = vi.hoisted(() => ({
  pathname: "/tareas",
  clockImplemented: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
// The Bandeja badge slot is an async server component, which a client-side render cannot resolve.
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: { fetchNotificationsAction: false } }));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({
  get IMPLEMENTED() {
    return {
      fetchTimeTrackingSettingsAction: state.clockImplemented,
      saveTimeTrackingSettingsAction: state.clockImplemented,
      fetchMyTodayAction: state.clockImplemented,
      clockInAction: state.clockImplemented,
      pauseWorkAction: state.clockImplemented,
      resumeWorkAction: state.clockImplemented,
      clockOutAction: state.clockImplemented,
      fetchTeamHoursAction: state.clockImplemented,
      fetchMyWeekHoursAction: state.clockImplemented,
    };
  },
}));
vi.mock("./TimeClock", () => ({
  TimeClock: ({ variant }: { variant?: string }) => <div data-testid="time-clock" data-variant={variant} />,
}));
vi.mock("./AvatarMenu", () => ({
  AvatarMenu: ({ session }: { session: { name: string } }) => (
    <button type="button" data-slot="dropdown-menu-trigger" aria-label={`Menú de la cuenta de ${session.name}`} />
  ),
}));

import type { TodayStatus } from "@/lib/types/redesign";
import {
  BOTTOM_TABS_CONTENT_CLASS,
  DEFAULT_MOBILE_TITLE,
  badgeLabel,
  mobileTitleFor,
  splitBottomTabs,
} from "@/lib/ui/mobile-nav";
import type { NavItem, NavModel } from "@/lib/ui/nav";

import { AppShell } from "./AppShell";
import { BottomTabs } from "./BottomTabs";
import { MobileTopBar, showsCompactClock } from "./MobileTopBar";

const NAV: NavModel = {
  items: [
    { key: "inicio", label: "Inicio", href: "/inicio", icon: House },
    { key: "mi-espacio", label: "Mi espacio", href: "/mi-espacio", icon: Inbox, badge: 5 },
    { key: "tareas", label: "Tareas", href: "/tareas", icon: SquareCheck, badge: 3 },
    { key: "proyectos", label: "Proyectos", href: "/proyectos", icon: Folder },
    { key: "personas", label: "Personas", href: "/personas", icon: Users },
    { key: "biblioteca", label: "Biblioteca", href: "/biblioteca", icon: BookOpen },
    { key: "asistente", label: "Asistente", href: "/asistente", icon: Sparkles },
  ],
  tramos: [],
  footer: [{ key: "ajustes", label: "Ajustes", href: "/ajustes", icon: SlidersHorizontal }],
};

const TABS = splitBottomTabs(NAV);

const session = { staffId: "s1", name: "Ana López", role: "Administrador", isAdmin: true, photoUrl: null };

const TODAY: TodayStatus = {
  state: "on",
  startedAt: "2026-11-06T15:00:00.000Z",
  workedSeconds: 3600,
  required: false,
  promptAtLogin: false,
  enabled: true,
  requiredFrom: null,
  hoursPerDay: 8,
};

type Listener = (event: MediaQueryListEvent) => void;

/** Mocks `window.matchMedia` at a given viewport width; returns a resize helper. */
function mockViewport(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<Listener>();
  const matches = (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return max ? width <= Number(max[1]) : false;
  };
  const matchMedia = vi.fn((query: string) => ({
    get matches() {
      return matches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => true,
  }));
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
  return {
    matchMedia,
    resize(next: number) {
      width = next;
      act(() => {
        for (const listener of [...listeners]) listener({ matches: next < 768 } as MediaQueryListEvent);
      });
    },
  };
}

function renderTabs(activeKey: NavItem["key"] | null = "tareas") {
  return render(<BottomTabs activeKey={activeKey} items={TABS.items} more={TABS.more} />);
}

beforeEach(() => {
  state.pathname = "/tareas";
  state.clockImplemented = false;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("splitBottomTabs", () => {
  it("puts Inicio, Tareas, Mi espacio and Proyectos in the tabs, in that order", () => {
    expect(TABS.items.map((item) => item.key)).toEqual(["inicio", "tareas", "mi-espacio", "proyectos"]);
  });

  it("leaves Personas, Biblioteca, Asistente and Ajustes for Más", () => {
    expect(TABS.more.map((item) => item.label)).toEqual(["Personas", "Biblioteca", "Asistente", "Ajustes"]);
  });

  it("skips items that the nav model hid", () => {
    const partial = splitBottomTabs({ items: NAV.items.filter((item) => item.key !== "mi-espacio"), footer: [] });
    expect(partial.items.map((item) => item.key)).toEqual(["inicio", "tareas", "proyectos"]);
    expect(partial.more.map((item) => item.key)).toEqual(["personas", "biblioteca", "asistente"]);
  });
});

describe("mobileTitleFor", () => {
  it("returns the section title of the route", () => {
    expect(mobileTitleFor("/inicio")).toBe("Inicio");
    expect(mobileTitleFor("/proyectos/12/tareas")).toBe("Proyectos");
    expect(mobileTitleFor("/ajustes/perfil")).toBe("Ajustes");
    expect(mobileTitleFor("/mi-espacio")).toBe("Mi espacio");
  });

  it("falls back to Cincel", () => {
    expect(mobileTitleFor("/")).toBe(DEFAULT_MOBILE_TITLE);
    expect(mobileTitleFor(null)).toBe(DEFAULT_MOBILE_TITLE);
    expect(mobileTitleFor("/inicios")).toBe(DEFAULT_MOBILE_TITLE);
  });

  it("caps badge text at 99+", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(120)).toBe("99+");
  });
});

describe("BottomTabs below 768 px", () => {
  beforeEach(() => {
    mockViewport(390);
  });

  it("renders the four tabs and Más", () => {
    renderTabs();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent?.replace(/,.*$/, "").replace(/\d+$/, ""))).toEqual([
      "Inicio",
      "Tareas",
      "Mi espacio",
      "Proyectos",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/inicio", "/tareas", "/mi-espacio", "/proyectos"]);
    expect(within(nav).getByRole("button", { name: /Más/ })).toBeTruthy();
  });

  it("marks the active tab with aria-current and the sidebar-primary tokens", () => {
    renderTabs("tareas");
    const active = screen.getByRole("link", { name: /^Tareas/ });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("bg-sidebar-primary");
    expect(active.className).toContain("text-sidebar-primary-foreground");
    const idle = screen.getByRole("link", { name: /^Inicio/ });
    expect(idle.getAttribute("aria-current")).toBeNull();
    expect(idle.className).not.toContain("bg-sidebar-primary");
  });

  it("marks Más active when the current page lives in the sheet", () => {
    renderTabs("personas");
    const more = screen.getByRole("button", { name: /Más/ });
    expect(more.hasAttribute("data-active")).toBe(true);
    expect(more.className).toContain("bg-sidebar-primary");
    for (const link of screen.getAllByRole("link")) expect(link.getAttribute("aria-current")).toBeNull();
  });

  it("shows the unread and overdue badges from the nav model", () => {
    renderTabs();
    const miEspacio = screen.getByRole("link", { name: /^Mi espacio/ });
    expect(miEspacio.textContent).toContain("5");
    expect(within(miEspacio).getByText(", 5 pendientes").className).toContain("sr-only");
    const tareas = screen.getByRole("link", { name: /^Tareas/ });
    expect(tareas.textContent).toContain("3");
    expect(screen.getByRole("link", { name: /^Inicio/ }).querySelector("[data-slot=bottom-tabs-badge]")).toBeNull();
  });

  it("opens the Más sheet with Personas, Biblioteca, Asistente and Ajustes", async () => {
    renderTabs();
    fireEvent.click(screen.getByRole("button", { name: /Más/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Más")).toBeTruthy();
    const links = within(sheet).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Personas", "Biblioteca", "Asistente", "Ajustes"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/personas", "/biblioteca", "/asistente", "/ajustes"]);
  });

  it("marks the active item inside the sheet and closes after a pick", async () => {
    renderTabs("biblioteca");
    fireEvent.click(screen.getByRole("button", { name: /Más/ }));
    const sheet = await screen.findByRole("dialog");
    const active = within(sheet).getByRole("link", { name: "Biblioteca" });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.className).toContain("bg-sidebar-primary");
    fireEvent.click(within(sheet).getByRole("link", { name: "Personas" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes the sheet with Cerrar", async () => {
    renderTabs();
    fireEvent.click(screen.getByRole("button", { name: /Más/ }));
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("hides Más when nothing is left for the sheet", () => {
    render(<BottomTabs activeKey="inicio" items={TABS.items} more={[]} />);
    expect(screen.queryByRole("button", { name: /Más/ })).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("renders nothing while the nav model has no items (flags off)", () => {
    const { container } = render(<BottomTabs activeKey={null} items={[]} more={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("keeps every tap target at 44 px or more", async () => {
    renderTabs();
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    for (const target of [...within(nav).getAllByRole("link"), within(nav).getByRole("button", { name: /Más/ })]) {
      expect(target.className).toContain("min-h-[52px]");
      expect(target.className).toContain("w-full");
    }
    fireEvent.click(within(nav).getByRole("button", { name: /Más/ }));
    const sheet = await screen.findByRole("dialog");
    for (const link of within(sheet).getAllByRole("link")) expect(link.className).toContain("min-h-11");
    expect(within(sheet).getByRole("button", { name: "Cerrar" }).className).toContain("h-11");
  });

  it("is hidden from 768 px up by CSS too", () => {
    renderTabs();
    expect(screen.getByRole("navigation", { name: "Navegación principal" }).className).toContain("md:hidden");
  });
});

describe("BottomTabs at 768 px and above", () => {
  it("renders nothing at 768 px", () => {
    mockViewport(768);
    const { container } = renderTabs();
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing at 1440 px", () => {
    mockViewport(1440);
    const { container } = renderTabs();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("follows the viewport when it crosses the breakpoint", () => {
    const viewport = mockViewport(1024);
    renderTabs();
    expect(screen.queryByRole("navigation")).toBeNull();
    viewport.resize(390);
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeTruthy();
    viewport.resize(900);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("MobileTopBar", () => {
  it("shows the page title and the avatar menu below 768 px", () => {
    mockViewport(390);
    state.pathname = "/proyectos/4/resumen";
    render(<MobileTopBar session={session} today={null} />);
    const bar = document.querySelector("[data-slot=mobile-top-bar]") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.className).toContain("md:hidden");
    expect(within(bar).getByText("Proyectos")).toBeTruthy();
    const avatar = within(bar).getByRole("button", { name: "Menú de la cuenta de Ana López" });
    expect(avatar.closest("[data-slot=mobile-top-bar-avatar]")?.className).toContain(
      "[&_[data-slot=dropdown-menu-trigger]]:size-11",
    );
  });

  it("takes an explicit title over the route title", () => {
    mockViewport(390);
    render(<MobileTopBar session={session} today={null} title="Guadalajara 83" />);
    expect(screen.getByText("Guadalajara 83")).toBeTruthy();
  });

  it("hides the TimeClock slot while time tracking is not implemented", () => {
    mockViewport(390);
    state.clockImplemented = false;
    render(<MobileTopBar session={session} today={TODAY} />);
    expect(screen.queryByTestId("time-clock")).toBeNull();
  });

  it("hides the TimeClock slot while time tracking is disabled or the viewer is exempt", () => {
    mockViewport(390);
    state.clockImplemented = true;
    const { rerender } = render(<MobileTopBar session={session} today={{ ...TODAY, enabled: false }} />);
    expect(screen.queryByTestId("time-clock")).toBeNull();
    rerender(<MobileTopBar session={session} today={null} />);
    expect(screen.queryByTestId("time-clock")).toBeNull();
  });

  it("shows the compact TimeClock once time tracking is enabled", () => {
    mockViewport(390);
    state.clockImplemented = true;
    render(<MobileTopBar session={session} today={TODAY} />);
    expect(screen.getByTestId("time-clock").getAttribute("data-variant")).toBe("compact");
    expect(showsCompactClock(TODAY)).toBe(true);
  });

  it("renders nothing at 768 px and above", () => {
    mockViewport(1024);
    const { container } = render(<MobileTopBar session={session} today={TODAY} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("AppShell mobile chrome", () => {
  const appearance = {} as Parameters<typeof AppShell>[0]["appearance"];

  it("renders the compact top bar and pads the page for the tabs below 768 px", () => {
    mockViewport(390);
    state.pathname = "/inicio";
    render(
      <AppShell appearance={appearance} session={session} nav={NAV} today={null}>
        <p>Contenido</p>
      </AppShell>,
    );
    expect(document.querySelector("[data-slot=mobile-top-bar]")).toBeTruthy();
    // The tab-bar padding wraps the page-content column (which carries the page margins).
    const pageContent = screen.getByText("Contenido").closest("[data-slot=page-content]") as HTMLElement;
    const content = pageContent.parentElement as HTMLElement;
    expect(content.className.split(" ")).toEqual(expect.arrayContaining(BOTTOM_TABS_CONTENT_CLASS.split(" ")));
  });

  it("leaves the page unpadded from 768 px up and renders no top bar", () => {
    mockViewport(1280);
    render(
      <AppShell appearance={appearance} session={session} nav={NAV} today={null}>
        <p>Contenido</p>
      </AppShell>,
    );
    expect(document.querySelector("[data-slot=mobile-top-bar]")).toBeNull();
    expect(BOTTOM_TABS_CONTENT_CLASS).toContain("md:pb-0");
  });
});
