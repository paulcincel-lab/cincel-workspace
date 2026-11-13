// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import type { SessionAccess } from "@/lib/auth/session";
import type { InicioPageData } from "@/lib/loaders/inicio";
import { createTestQueryClient } from "@/lib/query/test-utils";
import type { InicioData, ResolvedAppearance } from "@/lib/types/redesign";

const state = vi.hoisted(() => ({
  session: { status: "guest", user: null } as SessionAccess,
  firstLogin: { wizard: null, route: null, showGoogleSetupBanner: false } as {
    wizard: string | null;
    route: string | null;
    showGoogleSetupBanner: boolean;
  },
  style: "visual" as "visual" | "esencial" | "analitico",
  search: new URLSearchParams(),
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
const loadInicioPage = vi.hoisted(() => vi.fn());
const getInicioPageData = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect, useSearchParams: () => state.search }));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: async () => state.session,
  requireCapabilityUser: async () => {
    const user = state.session.user;
    if (!user) throw new Error("FORBIDDEN");
    return { member: { id: user.id, name: user.name }, email: user.email ?? "", access: user.access };
  },
}));
vi.mock("@/lib/loaders/inicio", () => ({
  readFirstLoginState: async () => state.firstLogin,
  loadInicioPage,
}));
vi.mock("@/lib/actions/page-data/inicio-actions", () => ({ getInicioPageData }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn() }));
vi.mock("@/components/inicio/InicioClient", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  const { useQueryClient } = await import("@tanstack/react-query");
  const { qk } = await import("@/lib/query/keys");
  return {
    InicioClient: (props: { me: { firstName: string; role: string } }) => {
      const { style, isOverridden } = useStyle();
      const page = useQueryClient().getQueryData<InicioPageData>(qk.inicio());
      return (
        <div data-testid="inicio">
          <span data-testid="style">{`${style}${isOverridden ? " (url)" : ""}`}</span>
          <span data-testid="me">{`${props.me.firstName} · ${props.me.role}`}</span>
          <span data-testid="kpis">{page ? page.inicio.kpis.length : "none"}</span>
          <span data-testid="banner">{page?.firstLogin.showGoogleSetupBanner ? "yes" : "no"}</span>
        </div>
      );
    },
  };
});

import { AppearanceStoreProvider } from "@/lib/stores/appearance-store";

import InicioPage from "./page";

/** The appearance the root layout seeds the store with. */
function appearance(): ResolvedAppearance {
  return {
    theme: "azul",
    mode: "light",
    style: state.style,
    density: "comoda",
    textSize: 14,
    cssVars: { light: {}, dark: {} },
    version: 1,
  };
}

const DATA: InicioData = {
  kpis: [{ key: "vencidas", label: "Vencidas", value: 4 }],
  tasksByEtapa: [],
  weeklyPace: [],
  attention: [],
  myDay: [],
  myWeek: { today: [], week: [], total: 0 },
  myAttention: 0,
  projectsProgress: [],
  workload: [],
  hero: { dueToday: 0, overdue: 0, overdueProjects: 0, focusProject: null },
  openShifts: null,
  todayAgenda: [],
};

const ACTIVE: SessionAccess = {
  status: "active",
  user: {
    id: "s-1",
    name: "Ana María López",
    email: "ana@cincel.mx",
    role: "Arquitecta de proyecto",
    area: null,
    active: true,
    mustChangePassword: false,
    googleLinked: true,
    access: "Colaborador",
  },
};

/**
 * Renders the page's RSC output under a browser client and the appearance
 * store, the way the root layout wraps it; `params` is the page URL's query.
 */
async function renderPage(params: Record<string, string> = {}) {
  state.search = new URLSearchParams(params);
  const element = await InicioPage();
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AppearanceStoreProvider initial={appearance()}>{element}</AppearanceStoreProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.session = ACTIVE;
  state.firstLogin = { wizard: null, route: null, showGoogleSetupBanner: false };
  state.style = "visual";
  loadInicioPage.mockImplementation(async () => ({
    inicio: DATA,
    firstLogin: { showGoogleSetupBanner: state.firstLogin.showGoogleSetupBanner },
  }));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/inicio", () => {
  it("sends a first-login admin to their setup wizard without loading Inicio", async () => {
    state.firstLogin = { wizard: "google_groups", route: "/ajustes/google/primeros-pasos", showGoogleSetupBanner: false };
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT /ajustes/google/primeros-pasos");
    expect(loadInicioPage).not.toHaveBeenCalled();
  });

  it("hands the Google setup banner flag to the client through the query", async () => {
    await renderPage();
    expect(screen.getByTestId("banner").textContent).toBe("no");
    cleanup();

    state.firstLogin = { wizard: null, route: null, showGoogleSetupBanner: true };
    await renderPage();
    expect(screen.getByTestId("banner").textContent).toBe("yes");
    expect(screen.getByTestId("inicio")).toBeTruthy();
  });

  it("sends guests to the login", async () => {
    state.session = { status: "guest", user: null };
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("prefetches qk.inicio() by calling the loader directly, never the action", async () => {
    await renderPage();
    expect(loadInicioPage).toHaveBeenCalledTimes(1);
    expect(loadInicioPage.mock.calls[0][0]).toMatchObject({ member: { id: "s-1" } });
    expect(getInicioPageData).not.toHaveBeenCalled();
    expect(screen.getByTestId("me").textContent).toBe("Ana · Arquitecta de proyecto");
    expect(screen.getByTestId("kpis").textContent).toBe("1");
  });

  it("uses the store's style (no page wrapper)", async () => {
    state.style = "analitico";
    await renderPage();
    expect(screen.getByTestId("style").textContent).toBe("analitico");
  });

  it("lets ?estilo= in the URL override the style", async () => {
    await renderPage({ estilo: "esencial" });
    expect(screen.getByTestId("style").textContent).toBe("esencial (url)");
  });

  it("ignores an unknown ?estilo=", async () => {
    await renderPage({ estilo: "otro" });
    expect(screen.getByTestId("style").textContent).toBe("visual");
  });
});
