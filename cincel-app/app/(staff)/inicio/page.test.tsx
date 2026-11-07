// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { SessionAccess } from "@/lib/auth/session";
import type { InicioData, ResolvedAppearance } from "@/lib/types/redesign";

const state = vi.hoisted(() => ({
  session: { status: "guest", user: null } as SessionAccess,
  redesignEnabled: true,
  style: "visual" as "visual" | "esencial" | "analitico",
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
const redirectIfRedesignOff = vi.hoisted(() => vi.fn(async () => undefined));
const fetchInicioAction = vi.hoisted(() => vi.fn());
const staffPhotoUrl = vi.hoisted(() => vi.fn(async () => "/api/staff/s-1/photo?v=abcd1234"));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: async () => state.session }));
vi.mock("@/lib/ui/redesign-redirect", () => ({ redirectIfRedesignOff }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () =>
    ({
      theme: "azul",
      mode: "light",
      style: state.style,
      density: "comoda",
      textSize: 14,
      redesignEnabled: state.redesignEnabled,
      cssVars: { light: {}, dark: {} },
      version: 1,
    }) satisfies ResolvedAppearance,
}));
vi.mock("@/lib/actions/dashboard-actions", () => ({ fetchInicioAction }));
vi.mock("@/lib/inicio/photo-url", () => ({ staffPhotoUrl }));
vi.mock("@/components/inicio/InicioClient", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  return {
    InicioClient: (props: { data: InicioData; photoUrl: string | null; me: { firstName: string; role: string } }) => {
      const { style, isOverridden } = useStyle();
      return (
        <div data-testid="inicio">
          <span data-testid="style">{`${style}${isOverridden ? " (url)" : ""}`}</span>
          <span data-testid="me">{`${props.me.firstName} · ${props.me.role}`}</span>
          <span data-testid="photo">{props.photoUrl ?? "none"}</span>
          <span data-testid="kpis">{props.data.kpis.length}</span>
        </div>
      );
    },
  };
});

import InicioPage from "./page";

const DATA: InicioData = {
  kpis: [{ key: "vencidas", label: "Vencidas", value: 4 }],
  tasksByTramo: [],
  weeklyPace: [],
  attention: [],
  myDay: [],
  projectsProgress: [],
  workload: [],
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

async function renderPage(params: Record<string, string> = {}) {
  render(await InicioPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  state.session = ACTIVE;
  state.redesignEnabled = true;
  state.style = "visual";
  fetchInicioAction.mockResolvedValue(DATA);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/inicio", () => {
  it("asks the flag-aware redirect first", async () => {
    await renderPage({ estilo: "esencial" });
    expect(redirectIfRedesignOff).toHaveBeenCalledWith("/inicio", { estilo: "esencial" });
  });

  it("sends flag-off users to the legacy dashboard without loading Inicio", async () => {
    state.redesignEnabled = false;
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT /dashboard");
    expect(fetchInicioAction).not.toHaveBeenCalled();
  });

  it("sends guests to the login", async () => {
    state.session = { status: "guest", user: null };
    await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });

  it("renders InicioClient with the data, the photo and the first name", async () => {
    await renderPage();
    expect(fetchInicioAction).toHaveBeenCalledTimes(1);
    expect(staffPhotoUrl).toHaveBeenCalledWith("s-1");
    expect(screen.getByTestId("me").textContent).toBe("Ana · Arquitecta de proyecto");
    expect(screen.getByTestId("photo").textContent).toBe("/api/staff/s-1/photo?v=abcd1234");
    expect(screen.getByTestId("kpis").textContent).toBe("1");
  });

  it("uses the resolved style", async () => {
    state.style = "analitico";
    await renderPage();
    expect(screen.getByTestId("style").textContent).toBe("analitico");
  });

  it("lets ?estilo= override the style for this render", async () => {
    await renderPage({ estilo: "esencial" });
    expect(screen.getByTestId("style").textContent).toBe("esencial (url)");
  });

  it("ignores an unknown ?estilo=", async () => {
    await renderPage({ estilo: "otro" });
    expect(screen.getByTestId("style").textContent).toBe("visual");
  });
});
