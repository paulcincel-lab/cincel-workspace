// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/inicio" as string | null,
  search: { searchWorkspaceAction: false },
  time: { clockInAction: false },
  notifications: { fetchNotificationsAction: false },
  assistant: { fetchAssistantThreadAction: false },
  bottomTabs: [] as { activeKey: string | null; items: { key: string }[]; more: { key: string }[] }[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/actions/search-actions.flags", () => ({ IMPLEMENTED: state.search }));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({ IMPLEMENTED: state.time }));
vi.mock("@/lib/actions/notifications-actions.flags", () => ({ IMPLEMENTED: state.notifications }));
vi.mock("@/lib/actions/assistant-actions.flags", () => ({ IMPLEMENTED: state.assistant }));
vi.mock("@/components/shell/BottomTabs", () => ({
  BottomTabs: (props: { activeKey: string | null; items: { key: string }[]; more: { key: string }[] }) => {
    state.bottomTabs.push(props);
    return null;
  },
}));
vi.mock("@/components/shell/CommandPalette", () => ({
  CommandPalette: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Buscar en Cincel" /> : null),
}));
vi.mock("@/components/asistente/AssistantButton", () => ({
  AssistantButton: ({ onOpen }: { onOpen(): void }) => (
    <button type="button" onClick={onOpen}>
      Pregúntale a Cincel
    </button>
  ),
}));
vi.mock("@/components/asistente/AssistantSheet", () => ({ AssistantSheet: () => null }));

import { AppShell } from "../AppShell";
import { AppShellClient } from "../AppShellClient";
import { Sidebar, type SidebarProps } from "../Sidebar";
import { toClientNavModel } from "@/lib/ui/nav-client";
import type { ResolvedAppearance } from "@/lib/types/redesign";

import { ADMIN_SESSION, EMPTY_NAV, FULL_NAV, navItem, STAFF_SESSION, TODAY_ON, WithSidebarProvider } from "./shell-fixtures";

const APPEARANCE: ResolvedAppearance = {
  theme: "azul",
  mode: "light",
  style: "visual",
  density: "comoda",
  textSize: 14,
  redesignEnabled: true,
  cssVars: { light: {}, dark: {} },
  version: 1,
};

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    nav: FULL_NAV,
    activeKey: "inicio",
    session: ADMIN_SESSION,
    today: null,
    onOpenSearch: vi.fn(),
    ...overrides,
  };
  render(
    <WithSidebarProvider>
      <Sidebar {...props} />
    </WithSidebarProvider>,
  );
  return props;
}

function mainNav() {
  return screen.getByRole("navigation", { name: "Principal" });
}

afterEach(() => {
  cleanup();
  state.pathname = "/inicio";
  state.search.searchWorkspaceAction = false;
  state.time.clockInAction = false;
  state.notifications.fetchNotificationsAction = false;
  state.assistant.fetchAssistantThreadAction = false;
  state.bottomTabs = [];
});

describe("Sidebar", () => {
  it("renders the logo, the seven items in order, the Tramos list, Ajustes and the user block", () => {
    renderSidebar();

    expect(screen.getByText("CINCEL")).toBeTruthy();
    const links = within(mainNav()).getAllByRole("link");
    expect(links.slice(0, 7).map((link) => link.getAttribute("href"))).toEqual([
      "/inicio",
      "/mi-espacio",
      "/tareas",
      "/proyectos",
      "/personas",
      "/biblioteca",
      "/asistente",
    ]);
    expect(screen.getByText("Tramos")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Diseño" }).getAttribute("href")).toBe("/tareas?tramo=diseno");
    expect(within(screen.getByRole("navigation", { name: "Ajustes" })).getByRole("link", { name: "Ajustes" })).toBeTruthy();
    expect(screen.getByText("Alejandro Riofrio")).toBeTruthy();
    expect(screen.getByText("Administrador")).toBeTruthy();
  });

  it("marks only the active item with the active tokens and aria-current", () => {
    renderSidebar({ activeKey: "tareas" });

    const active = screen.getByRole("link", { name: /^Tareas/ });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.hasAttribute("data-active")).toBe(true);
    expect(active.className).toContain("data-active:bg-sidebar-primary");
    expect(active.className).toContain("data-active:text-sidebar-primary-foreground");

    const inactive = screen.getByRole("link", { name: "Inicio" });
    expect(inactive.getAttribute("aria-current")).toBeNull();
    expect(inactive.hasAttribute("data-active")).toBe(false);
  });

  it("renders a lucide icon per item", () => {
    renderSidebar();
    const inicio = screen.getByRole("link", { name: "Inicio" });
    expect(inicio.querySelector("svg.lucide")).toBeTruthy();
  });

  it("shows the badges with an accessible count", () => {
    renderSidebar();

    const miEspacio = screen.getByRole("link", { name: /Mi espacio/ });
    expect(miEspacio.textContent).toContain("5 pendientes");
    expect(screen.getByText("31")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Proyectos" }).textContent).not.toContain("pendientes");
  });

  it("caps long badges at 99+", () => {
    renderSidebar({ nav: { ...FULL_NAV, items: [navItem("tareas", 250)] } });
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("renders only the items of the nav model", () => {
    renderSidebar({ nav: { items: [navItem("proyectos")], tramos: [], footer: [] } });

    expect(within(mainNav()).getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Tramos")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Ajustes" })).toBeNull();
  });

  it("links the name to Perfil only while Ajustes is in the nav model", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: "Alejandro Riofrio" }).getAttribute("href")).toBe("/ajustes/perfil");

    cleanup();
    renderSidebar({ nav: { ...FULL_NAV, footer: [] } });
    expect(screen.queryByRole("link", { name: "Alejandro Riofrio" })).toBeNull();
    expect(screen.getByText("Alejandro Riofrio")).toBeTruthy();
  });

  it("shows the viewer initials when there is no photo", () => {
    renderSidebar({ session: STAFF_SESSION });
    expect(screen.getByText("PL")).toBeTruthy();
  });

  it("hides the search button while searchWorkspaceAction is not implemented", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("shows the search button once search is implemented and opens the palette", () => {
    state.search.searchWorkspaceAction = true;
    const props = renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(props.onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("hides the time clock slot while clockInAction is not implemented", () => {
    renderSidebar({ today: TODAY_ON, slots: { "time-clock": <section aria-label="Registro de jornada" /> } });
    expect(screen.queryByRole("region", { name: "Registro de jornada" })).toBeNull();
  });

  it("hides the time clock slot while fetchMyTodayAction reports enabled: false", () => {
    state.time.clockInAction = true;
    renderSidebar({
      today: { ...TODAY_ON, enabled: false },
      slots: { "time-clock": <section aria-label="Registro de jornada" /> },
    });
    expect(screen.queryByRole("region", { name: "Registro de jornada" })).toBeNull();
  });

  it("renders the time clock slot when implemented and enabled", () => {
    state.time.clockInAction = true;
    renderSidebar({ today: TODAY_ON, slots: { "time-clock": <section aria-label="Registro de jornada" /> } });
    expect(screen.getByRole("region", { name: "Registro de jornada" })).toBeTruthy();
  });

  it("renders the Bandeja badge slot in place of the Mi espacio badge", () => {
    renderSidebar({ slots: { "bandeja-badge": <span>7</span> } });
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.queryByText("5")).toBeNull();
  });
});

describe("AppShellClient", () => {
  function renderShell(pathname: string, nav = FULL_NAV, hideAssistant?: boolean) {
    state.pathname = pathname;
    render(
      <AppShellClient nav={toClientNavModel(nav)} session={ADMIN_SESSION} today={null} hideAssistant={hideAssistant}>
        <h1>Contenido</h1>
      </AppShellClient>,
    );
  }

  it("derives the active item from the pathname", () => {
    renderShell("/proyectos/123/cronograma");
    expect(screen.getByRole("link", { name: "Proyectos" }).getAttribute("aria-current")).toBe("page");
  });

  it("lights Ajustes on a settings page", () => {
    renderShell("/ajustes/perfil");
    expect(screen.getByRole("link", { name: "Ajustes" }).getAttribute("aria-current")).toBe("page");
  });

  it("renders the page inside the main region", () => {
    renderShell("/inicio");
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Contenido" })).toBeTruthy();
  });

  it("hands the first four mobile tabs and the rest to BottomTabs", () => {
    renderShell("/tareas");
    const last = state.bottomTabs.at(-1)!;
    expect(last.activeKey).toBe("tareas");
    expect(last.items.map((i) => i.key)).toEqual(["inicio", "tareas", "mi-espacio", "proyectos"]);
    expect(last.more.map((i) => i.key)).toEqual(["personas", "biblioteca", "asistente", "ajustes"]);
  });

  it("mounts the palette only once search is implemented", () => {
    renderShell("/inicio");
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();

    cleanup();
    state.search.searchWorkspaceAction = true;
    renderShell("/inicio");
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(screen.getByRole("dialog", { name: "Buscar en Cincel" })).toBeTruthy();
  });

  it("shows the assistant button only once implemented and never on /asistente", () => {
    // AppShell mounts the assistant launcher next to its client part.
    const renderFullShell = (pathname: string, hideAssistant?: boolean) => {
      state.pathname = pathname;
      render(
        <AppShell appearance={APPEARANCE} session={ADMIN_SESSION} nav={FULL_NAV} today={null} hideAssistant={hideAssistant}>
          <h1>Contenido</h1>
        </AppShell>,
      );
    };

    renderFullShell("/inicio");
    expect(screen.queryByRole("button", { name: "Pregúntale a Cincel" })).toBeNull();

    cleanup();
    state.assistant.fetchAssistantThreadAction = true;
    renderFullShell("/inicio");
    expect(screen.getByRole("button", { name: "Pregúntale a Cincel" })).toBeTruthy();

    cleanup();
    renderFullShell("/asistente");
    expect(screen.queryByRole("button", { name: "Pregúntale a Cincel" })).toBeNull();

    cleanup();
    renderFullShell("/inicio", true);
    expect(screen.queryByRole("button", { name: "Pregúntale a Cincel" })).toBeNull();
  });

  it("renders an empty sidebar without items", () => {
    renderShell("/proyectos", EMPTY_NAV);
    expect(screen.getByText("CINCEL")).toBeTruthy();
    expect(within(mainNav()).queryAllByRole("link")).toHaveLength(0);
  });
});

describe("AppShell", () => {
  function Shell({ children, today = null }: { children: ReactNode; today?: typeof TODAY_ON | null }) {
    return (
      <AppShell appearance={APPEARANCE} session={ADMIN_SESSION} nav={FULL_NAV} today={today}>
        {children}
      </AppShell>
    );
  }

  it("mounts one sidebar around the page", () => {
    state.pathname = "/inicio";
    render(
      <Shell>
        <p>Página</p>
      </Shell>,
    );
    expect(screen.getAllByRole("navigation", { name: "Principal" })).toHaveLength(1);
    expect(screen.getByText("Página")).toBeTruthy();
  });

  it("leaves the time clock out while clockInAction is not implemented", () => {
    render(
      <Shell today={TODAY_ON}>
        <p>Página</p>
      </Shell>,
    );
    expect(document.querySelector("[data-slot=sidebar-time-clock]")).toBeNull();
  });

  it("renders the time clock slot once implemented and enabled", () => {
    state.time.clockInAction = true;
    render(
      <Shell today={TODAY_ON}>
        <p>Página</p>
      </Shell>,
    );
    expect(document.querySelector("[data-slot=sidebar-time-clock]")).toBeTruthy();
  });
});
