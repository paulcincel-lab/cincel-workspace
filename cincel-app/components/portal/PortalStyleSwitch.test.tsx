// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/portal/proyectos/p1", tab: null as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.tab ? { tab: nav.tab } : {}),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({
  EstiloSwitch: ({ scope, variant }: { scope?: string; variant?: string }) => (
    <div data-testid="estilo" data-scope={scope} data-variant={variant} />
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";

import PortalShell from "./PortalShell";
import PortalStyleSwitch, { isPortalStyledPage } from "./PortalStyleSwitch";

describe("PortalStyleSwitch", () => {
  afterEach(cleanup);

  it("only the project page's Resumen has the three styles", () => {
    expect(isPortalStyledPage("/portal/proyectos/p1", null)).toBe(true);
    expect(isPortalStyledPage("/portal/proyectos/p1", "resumen")).toBe(true);
    expect(isPortalStyledPage("/portal/proyectos/p1", "desconocido")).toBe(true);
    expect(isPortalStyledPage("/portal/proyectos/p1", "archivos")).toBe(false);
    expect(isPortalStyledPage("/portal/proyectos/p1", "enviar")).toBe(false);
    expect(isPortalStyledPage("/portal", null)).toBe(false);
    expect(isPortalStyledPage("/portal/login", null)).toBe(false);
    expect(isPortalStyledPage(null, null)).toBe(false);
  });

  it("renders EstiloSwitch with the portal scope on the project page", () => {
    nav.pathname = "/portal/proyectos/p1";
    nav.tab = null;
    render(<PortalStyleSwitch />);
    expect(screen.getByTestId("estilo").getAttribute("data-scope")).toBe("portal");
  });

  it("renders nothing elsewhere", () => {
    nav.pathname = "/portal";
    render(<PortalStyleSwitch />);
    expect(screen.queryByTestId("estilo")).toBeNull();
  });

  it("renders nothing when the organization fixed the style, even on Resumen", () => {
    nav.pathname = "/portal/proyectos/p1";
    nav.tab = null;
    render(
      <StyleProvider style="visual" scope="portal" fixedByOrg>
        <PortalStyleSwitch />
      </StyleProvider>,
    );
    expect(screen.queryByTestId("estilo")).toBeNull();
  });

  it("renders the switch when the client may choose", () => {
    nav.pathname = "/portal/proyectos/p1";
    nav.tab = null;
    render(
      <StyleProvider style="visual" scope="portal" fixedByOrg={false}>
        <PortalStyleSwitch />
      </StyleProvider>,
    );
    expect(screen.getByTestId("estilo")).toBeTruthy();
  });

  it("inline in header on Resumen only", () => {
    nav.pathname = "/portal/proyectos/p1";
    nav.tab = null;
    render(
      <StyleProvider style="visual" scope="portal" fixedByOrg={false}>
        <PortalShell clientName="Ana López" companyName={null} styleSwitch={<PortalStyleSwitch />}>
          x
        </PortalShell>
      </StyleProvider>,
    );
    const header = screen.getByRole("banner");
    const estilo = screen.getByTestId("estilo");
    expect(header.contains(estilo)).toBe(true);
    // One bar: the switch shares the row with the logo instead of a row of its own under it.
    expect(estilo.closest("header > div")).toBe(header.firstElementChild);
    expect(estilo.getAttribute("data-variant")).toBe("segmented");
    cleanup();

    nav.tab = "cronograma";
    render(
      <StyleProvider style="visual" scope="portal" fixedByOrg={false}>
        <PortalShell clientName="Ana López" companyName={null} styleSwitch={<PortalStyleSwitch />}>
          x
        </PortalShell>
      </StyleProvider>,
    );
    expect(screen.queryByTestId("estilo")).toBeNull();
  });
});
