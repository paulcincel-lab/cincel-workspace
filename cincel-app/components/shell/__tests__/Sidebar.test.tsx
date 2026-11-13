// @vitest-environment happy-dom
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pathname: "/inicio" as string | null,
  search: { searchWorkspaceAction: false },
  time: { clockInAction: false },
  notifications: { fetchNotificationsAction: false },
  assistant: { fetchAssistantThreadAction: false },
  bottomTabs: [] as { activeKey: string | null; items: { key: string }[]; more: { key: string }[] }[],
  inicioPage: vi.fn(async () => ({ inicio: {} })),
  tareasPage: vi.fn(async () => ({ facets: {}, tramos: [], staff: [] })),
}));

// The avatar reads me.profile from the query cache; these tests render it without one.
vi.mock("@/components/shell/photo-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/photo-upload")>()),
  useMyProfile: (initial: unknown) => initial,
  usePhotoUploadMutation: () => ({ mutateAsync: async () => "" }),
  useRemovePhotoMutation: () => ({ mutateAsync: async () => undefined }),
}));
// The Sidebar reads the company settings from the query cache; these tests render it without one.
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { GENERAL_SETTINGS_DEFAULTS } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => GENERAL_SETTINGS_DEFAULTS };
});
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
vi.mock("@/components/shell/CommandPalette", async () => {
  const { useShellUi } = await import("@/lib/stores/shell-ui-store");
  return {
    CommandPalette: () =>
      useShellUi((s) => s.searchOpen) ? <div role="dialog" aria-label="Buscar en Cincel" /> : null,
  };
});
// Inicio's page-data query, warmed by the hover prefetch.
vi.mock("@/lib/query/options/inicio", () => ({
  inicioPageOptions: () => ({ queryKey: ["inicio"], queryFn: state.inicioPage, staleTime: 30_000 }),
}));
vi.mock("@/lib/query/options/tareas", () => ({
  tareasPageKeyInputOf: (query: { tramo: string | null }, estilo = "visual") => ({ estilo, tramo: query.tramo }),
  tareasPageOptions: (q: { estilo: string }) => ({ queryKey: ["tareas", "page", q], queryFn: state.tareasPage, staleTime: 30_000 }),
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
import { NAV_PREFETCH_DEBOUNCE_MS } from "@/lib/shell/nav-prefetch";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { useShellUi } from "@/lib/stores/shell-ui-store";
import { toClientNavModel } from "@/lib/ui/nav-client";
import type { ShellBadges } from "@/lib/types/shell";

import { ADMIN_SESSION, EMPTY_NAV, FULL_NAV, navItem, STAFF_SESSION, TODAY_ON, WithSidebarProvider } from "./shell-fixtures";

/** The cache the `(staff)` layout hydrates: the frame's badges (Mi espacio 5, Tareas 31) and the day. */
let client: QueryClient;

function setBadges(patch: { tareasOpen?: number; unreadCount?: number; dueReminders?: string[] } = {}) {
  const badges: ShellBadges = {
    tareasOpen: patch.tareasOpen ?? 31,
    bandeja: { unreadCount: patch.unreadCount ?? 5, dueReminders: patch.dueReminders ?? [] },
  };
  client.setQueryData(qk.shell.badges(), badges);
}

function render(ui: ReactElement) {
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  client = createTestQueryClient();
  setBadges();
  client.setQueryData(qk.me.today(), TODAY_ON);
});

function renderSidebar(overrides: Partial<SidebarProps> = {}) {
  const props: SidebarProps = {
    nav: FULL_NAV,
    activeKey: "inicio",
    session: ADMIN_SESSION,
    today: null,
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
  state.inicioPage.mockClear();
  state.tareasPage.mockClear();
});

describe("Sidebar", () => {
  it("renders the logo, the seven items in order, the Etapas list, Ajustes and the user block", () => {
    renderSidebar();

    expect(screen.getByText("CINCEL")).toBeTruthy();
    const links = within(mainNav()).getAllByRole("link");
    expect(links.slice(0, 7).map((link) => link.getAttribute("href"))).toEqual([
      "/inicio",
      "/tareas",
      "/proyectos",
      "/personas",
      "/mi-espacio",
      "/biblioteca",
      "/asistente",
    ]);
    expect(screen.getByText("Etapas")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Diseño" }).getAttribute("href")).toBe("/tareas?etapa=diseno");
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

  it("draws the count badges mono on the primary tint and hides them at 0", () => {
    renderSidebar({ nav: { ...FULL_NAV, items: [navItem("mi-espacio", 5), navItem("tareas", 31), navItem("proyectos", 0)] } });
    const badge = screen.getByText("31");
    expect(badge.getAttribute("data-slot")).toBe("badge");
    expect(badge.className).toContain("font-mono");
    expect(badge.className).toContain("bg-primary/15");
    expect(badge.className).toContain("text-primary");
    const proyectos = screen.getByRole("link", { name: "Proyectos" }).closest("li")!;
    expect(proyectos.querySelector("[data-slot=badge]")).toBeNull();
  });

  it("colors each etapa dot with its own color", () => {
    renderSidebar({
      nav: {
        ...FULL_NAV,
        tramos: [
          ...FULL_NAV.tramos,
          { key: "decoracion", name: "Decoración", colorVar: "var(--chart-4)", href: "/tareas?etapa=decoracion" },
        ],
      },
    });
    const dot = (name: string) =>
      (screen.getByRole("link", { name }).querySelector("span[aria-hidden=true]") as HTMLElement).style.background;
    expect(dot("Presale")).toBe("var(--chart-1)");
    expect(dot("Diseño")).toBe("var(--chart-2)");
    expect(dot("Construcción")).toBe("var(--chart-3)");
    expect(dot("Decoración")).toBe("var(--chart-4)");
  });

  it("caps long badges at 99+", () => {
    setBadges({ tareasOpen: 250 });
    renderSidebar({ nav: { ...FULL_NAV, items: [navItem("tareas")] } });
    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("renders only the items of the nav model", () => {
    renderSidebar({ nav: { items: [navItem("proyectos")], tramos: [], footer: [] } });

    expect(within(mainNav()).getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Etapas")).toBeNull();
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
    expect(document.querySelector("[data-slot=sidebar-user] [data-photo]")?.getAttribute("data-photo")).toBe("initials");
    expect(screen.getByText("Diseñadora")).toBeTruthy();
  });

  it("uses the profile photo when there is one, and the avatar opens the account menu", () => {
    renderSidebar({ session: { ...STAFF_SESSION, photoUrl: "/api/staff/s2/photo?v=abcd1234" } });
    expect(document.querySelector("[data-slot=sidebar-user] [data-photo]")?.getAttribute("data-photo")).toBe("photo");
    expect(screen.getByRole("button", { name: "Menú de la cuenta de Paula Lara" })).toBeTruthy();
  });

  it("hides the search button while searchWorkspaceAction is not implemented", () => {
    renderSidebar();
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("shows the search button once search is implemented and opens the palette through useShellUi", () => {
    state.search.searchWorkspaceAction = true;
    renderSidebar();

    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(useShellUi.getState().searchOpen).toBe(true);
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

describe("Sidebar per canvas", () => {
  const CANVAS_ITEMS = ["inicio", "tareas", "calendario", "proyectos", "personas", "mi-espacio", "biblioteca", "asistente"];

  it("orders the items as the canvas", async () => {
    // The registry's item files read the session only inside `resolve`; the order is static.
    vi.doMock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn() }));
    const { NAV_ITEM_SOURCES } = await import("@/lib/shell/nav-items");
    vi.doUnmock("@/lib/auth/session");
    const sorted = [...NAV_ITEM_SOURCES].sort((a, b) => a.order - b.order);
    expect(sorted.filter((source) => source.section === "items").map((source) => source.key)).toEqual(CANVAS_ITEMS);
    expect(sorted.filter((source) => source.section === "footer").map((source) => source.key)).toEqual(["ajustes"]);

    renderSidebar({ nav: { ...FULL_NAV, items: CANVAS_ITEMS.map((key) => navItem(key as Parameters<typeof navItem>[0])) } });
    const hrefs = within(mainNav())
      .getAllByRole("link")
      .slice(0, CANVAS_ITEMS.length)
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(CANVAS_ITEMS.map((key) => `/${key}`));
  });

  it.each([
    ["/tareas", /^Tareas/],
    ["/mi-espacio", /^Mi espacio/],
    ["/ajustes/perfil", /^Ajustes$/],
  ] as const)("marks the active item per route (%s)", (pathname, name) => {
    state.pathname = pathname;
    render(
      <AppShellClient nav={toClientNavModel(FULL_NAV)} session={ADMIN_SESSION} today={null}>
        <h1>Contenido</h1>
      </AppShellClient>,
    );
    const active = screen.getByRole("link", { name });
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.hasAttribute("data-active")).toBe(true);
    expect(active.className).toContain("data-active:bg-sidebar-primary");
    expect(active.className).toContain("data-active:text-sidebar-primary-foreground");
    // Only that link is active across the main nav and the footer.
    const navs = [mainNav(), screen.getByRole("navigation", { name: "Ajustes" })];
    expect(navs.flatMap((nav) => [...nav.querySelectorAll("a[data-active]")])).toEqual([active]);
  });
});

describe("Sidebar badges from qk.shell.badges()", () => {
  const plainNav = { ...FULL_NAV, items: FULL_NAV.items.map((item) => navItem(item.key)) };

  it("shows the query's counts on a nav model without badges", () => {
    setBadges({ tareasOpen: 4, unreadCount: 2, dueReminders: [new Date(Date.now() + 3_600_000).toISOString()] });
    renderSidebar({ nav: plainNav });
    expect(screen.getByText("4")).toBeTruthy();
    // Mi espacio: 2 unread + 1 reminder still due today.
    expect(screen.getByRole("link", { name: /Mi espacio/ }).textContent).toContain("3 pendientes");
  });

  it("hides both badges at 0", () => {
    setBadges({ tareasOpen: 0, unreadCount: 0 });
    renderSidebar({ nav: FULL_NAV });
    expect(screen.queryByText("31")).toBeNull();
    expect(screen.queryByText("5")).toBeNull();
    expect(screen.getByRole("link", { name: "Mi espacio" }).textContent).not.toContain("pendientes");
  });

  it("follows a cache update (poll or Bandeja patch) without a new render from the server", async () => {
    renderSidebar({ nav: plainNav });
    expect(screen.getByText("31")).toBeTruthy();
    act(() => setBadges({ tareasOpen: 30 }));
    // Query observers are notified on the next tick.
    expect(await screen.findByText("30")).toBeTruthy();
  });
});

describe("Sidebar hover prefetch", () => {
  afterEach(() => vi.useRealTimers());

  it("prefetches Inicio's page data once, 100 ms after hover or focus", async () => {
    vi.useFakeTimers();
    renderSidebar({ activeKey: "proyectos" });
    const inicio = screen.getByRole("link", { name: "Inicio" });

    fireEvent.mouseEnter(inicio);
    fireEvent.mouseLeave(inicio);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS * 2);
    });
    // Passing over the link calls nothing.
    expect(state.inicioPage).not.toHaveBeenCalled();

    fireEvent.mouseEnter(inicio);
    fireEvent.focus(inicio);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS);
    });
    expect(state.inicioPage).toHaveBeenCalledTimes(1);

    // Fresh data: a second hover issues no call.
    fireEvent.mouseLeave(inicio);
    fireEvent.mouseEnter(inicio);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS);
    });
    expect(state.inicioPage).toHaveBeenCalledTimes(1);
  });

  it("prefetches the default Tareas view the same way", async () => {
    vi.useFakeTimers();
    renderSidebar();
    fireEvent.focus(screen.getByRole("link", { name: /^Tareas/ }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS);
    });
    expect(state.tareasPage).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["tareas", "page", { estilo: "visual", tramo: null }])).toBeTruthy();
  });

  it("prefetches nothing for the other links", async () => {
    vi.useFakeTimers();
    renderSidebar();
    for (const name of ["Proyectos", "Personas", "Biblioteca"]) fireEvent.mouseEnter(screen.getByRole("link", { name }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS * 2);
    });
    expect(state.inicioPage).not.toHaveBeenCalled();
    expect(client.getQueryData(["inicio"])).toBeUndefined();
    expect(state.tareasPage).not.toHaveBeenCalled();
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

  it("pads the page once, in the shell content wrapper (FE §3: 0 28px 40px, 16 px mobile)", () => {
    renderShell("/inicio");
    const content = screen.getByRole("heading", { name: "Contenido" }).closest('[data-slot="page-content"]');
    expect(content?.className.split(" ")).toEqual(
      expect.arrayContaining(["p-4", "md:px-7", "md:pt-5", "md:pb-10", "gap-4"]),
    );
  });

  it("leaves the Asistente page full bleed", () => {
    renderShell("/asistente");
    const content = screen.getByRole("heading", { name: "Contenido" }).closest('[data-slot="page-content"]');
    expect(content?.className).not.toContain("md:px-7");
    expect(content?.className).not.toContain("p-4");
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
        <AppShell session={ADMIN_SESSION} nav={FULL_NAV} today={null} hideAssistant={hideAssistant}>
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
      <AppShell session={ADMIN_SESSION} nav={FULL_NAV} today={today}>
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
