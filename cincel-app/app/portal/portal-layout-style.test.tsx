// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { useStyle } from "@/components/shell/StyleProvider";

const state = vi.hoisted(() => ({
  session: undefined as string | undefined,
  redesignEnabled: true,
  style: "visual" as string,
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
    redesignEnabled: state.redesignEnabled,
    cssVars: { light: {}, dark: {} },
    version: 1,
  }),
}));
vi.mock("@/lib/portal/style-server", () => ({
  getPortalPresentation: async () => ({ redesignEnabled: state.redesignEnabled, style: state.style, fixedByOrg: false }),
}));
vi.mock("@/components/portal/PortalStyleSwitch", () => ({
  default: () => <div data-testid="estilo-switch" />,
}));

import PortalLayout from "./layout";

/** Reads the style the layout provided, as every widget does. */
function StyleProbe() {
  return <p data-testid="probe">{useStyle().style}</p>;
}

describe("portal layout: presentation style (FE §3.11)", () => {
  beforeEach(() => {
    state.session = "token";
    state.redesignEnabled = true;
    state.style = "visual";
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
    expect(screen.getByText("Portal de clientes").className).toContain("font-semibold");
  });

  it("shows no switch without a signed-in client", async () => {
    state.session = undefined;
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.queryByTestId("estilo-switch")).toBeNull();
  });

  it("with the redesign off renders as before: no switch, no style provider, legacy weights", async () => {
    state.redesignEnabled = false;
    state.style = "analitico";
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.queryByTestId("estilo-switch")).toBeNull();
    // Outside a StyleProvider useStyle() answers Visual: the cookie never reaches the legacy portal.
    expect(screen.getByTestId("probe").textContent).toBe("visual");
    expect(screen.getByText("Portal de clientes").className).toContain("font-extrabold");
  });

  it("offers no theme or mode control to the client", async () => {
    render(await PortalLayout({ children: <StyleProbe /> }));

    expect(screen.queryByRole("button", { name: /tema|modo|oscuro|claro/i })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: /tema|modo/i })).toBeNull();
  });
});
