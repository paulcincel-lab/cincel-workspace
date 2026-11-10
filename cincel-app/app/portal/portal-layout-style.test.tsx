// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { useStyle } from "@/components/shell/StyleProvider";

const state = vi.hoisted(() => ({
  session: undefined as string | undefined,
  style: "visual" as string,
  fixedByOrg: false,
  /** Render the real PortalStyleSwitch (with a stub EstiloSwitch) instead of the placeholder. */
  realSwitch: false,
  search: "",
}));
const getPortalUser = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "cincel_portal_session" && state.session ? { name, value: state.session } : undefined,
  }),
}));
vi.mock("@/lib/portal/session", () => ({ getPortalUser }));
vi.mock("@/lib/portal/appearance", () => ({
  getPortalAppearance: async () => ({
    theme: "azul",
    mode: "system",
    style: "visual",
    density: "comoda",
    textSize: 14,
    cssVars: { light: {}, dark: {} },
    version: 1,
  }),
}));
vi.mock("@/lib/portal/style-server", () => ({
  getPortalPresentation: async () => ({ style: state.style, fixedByOrg: state.fixedByOrg }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/proyectos/p1",
  useSearchParams: () => new URLSearchParams(state.search),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({
  EstiloSwitch: () => <div data-testid="estilo-switch" />,
}));
vi.mock("@/components/portal/PortalProjectMenu", () => ({
  default: () => <div data-testid="project-menu" />,
}));
vi.mock("@/components/portal/PortalStyleSwitch", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/portal/PortalStyleSwitch")>();
  const RealSwitch = real.default;
  return { default: () => (state.realSwitch ? <RealSwitch /> : <div data-testid="estilo-switch" />) };
});

import PortalLayout from "./layout";

/** Reads the style the layout provided, as every widget does. */
function StyleProbe() {
  return <p data-testid="probe">{useStyle().style}</p>;
}

describe("portal layout: presentation style (FE §3.11)", () => {
  beforeEach(() => {
    state.session = "token";
    state.style = "visual";
    state.fixedByOrg = false;
    state.realSwitch = false;
    state.search = "";
    getPortalUser.mockReset();
    getPortalUser.mockResolvedValue({ id: "u1", name: "Ana López", email: "ana@example.com" });
  });
  afterEach(cleanup);

  for (const style of ["visual", "esencial", "analitico"]) {
    it(`wraps the portal in StyleProvider scope="portal" with the cookie style (${style})`, async () => {
      state.style = style;
      render(await PortalLayout({ children: <StyleProbe /> }));

      expect(screen.getByTestId("probe").textContent).toBe(style);
    });
  }

  it("puts EstiloSwitch in the top bar for a signed-in client", async () => {
    render(await PortalLayout({ children: <StyleProbe /> }));

    const header = screen.getByRole("banner");
    expect(header.contains(screen.getByTestId("estilo-switch"))).toBe(true);
    expect(header.contains(screen.getByTestId("project-menu"))).toBe(true);
    expect(screen.getByRole("link", { name: "Cincel, inicio del portal" }).className).toContain("font-semibold");
  });

  it("shows no switch without a signed-in client", async () => {
    state.session = undefined;
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.queryByTestId("estilo-switch")).toBeNull();
  });

  it("offers no theme or mode control to the client", async () => {
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.queryByRole("button", { name: /tema|modo|oscuro|claro/i })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: /tema|modo/i })).toBeNull();
  });
});

describe("portal layout: style fixed by the organization (portal half of #951)", () => {
  beforeEach(() => {
    state.session = "token";
    state.style = "visual";
    state.fixedByOrg = false;
    state.realSwitch = true;
    state.search = "";
    getPortalUser.mockReset();
    getPortalUser.mockResolvedValue({ id: "u1", name: "Ana López", email: "ana@example.com" });
  });
  afterEach(cleanup);

  function FixedProbe() {
    const { isFixed } = useStyle();
    return <p data-testid="fixed">{String(isFixed)}</p>;
  }

  it("passes fixedByOrg to StyleProvider: the store reports the style as fixed", async () => {
    state.fixedByOrg = true;
    render(await PortalLayout({ children: <FixedProbe /> }));

    expect(screen.getByTestId("fixed").textContent).toBe("true");
  });

  it("shows no style switch when the organization fixed the style", async () => {
    state.fixedByOrg = true;
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.queryByTestId("estilo-switch")).toBeNull();
  });

  it("ignores ?estilo= when the style is fixed: the org style stays", async () => {
    state.fixedByOrg = true;
    state.style = "visual";
    state.search = "estilo=esencial";
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.getByTestId("probe").textContent).toBe("visual");
    expect(screen.queryByTestId("estilo-switch")).toBeNull();
  });

  it("still shows the switch on Resumen when the client may choose", async () => {
    render(await PortalLayout({ children: <FixedProbe /> }));

    expect(screen.getByTestId("fixed").textContent).toBe("false");
    expect(screen.getByTestId("estilo-switch")).toBeTruthy();
  });
});
