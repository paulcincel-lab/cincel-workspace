// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/portal", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/portal/page-data", () => ({ getPortalHomeData: vi.fn(), getPortalProjectData: vi.fn() }));

import { qk } from "@/lib/query/keys";
import { setBrowserQueryClient } from "@/lib/query/reset-client-state";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { PortalProjectDTO } from "@/lib/types/portal";

import PortalProjectMenu, { portalProjectIdFromPath } from "./PortalProjectMenu";
import PortalShell, { PORTAL_SIGN_OUT_URL, PortalPageColumn } from "./PortalShell";

afterEach(() => {
  cleanup();
  setBrowserQueryClient(null);
  nav.pathname = "/portal";
  nav.search = "";
});

const dto = (id: string, name: string): PortalProjectDTO => ({
  id,
  name,
  code: null,
  address: null,
  status: "activo",
  progressPct: 0,
  startDate: null,
  endDate: null,
  manager: null,
});

describe("PortalShell", () => {
  it("shows the logo, the client name and Salir pointing at the logout route", () => {
    render(<PortalShell clientName="Ana López" companyName={null}>contenido</PortalShell>);

    expect(screen.getByRole("link", { name: "Cincel, inicio del portal" }).getAttribute("href")).toBe("/portal");
    expect(screen.getByText("Ana López")).toBeTruthy();
    const salir = screen.getByRole("link", { name: "Salir" });
    expect(salir.getAttribute("href")).toBe(PORTAL_SIGN_OUT_URL);
    expect(PORTAL_SIGN_OUT_URL).toBe("/api/portal/auth/logout?next=%2Fportal%2Flogin");
    expect(screen.getByRole("main").textContent).toBe("contenido");
    // Avatar initials, hidden from screen readers (the name is read instead).
    expect(screen.getByText("AL").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows company name", () => {
    render(<PortalShell clientName="Ana López" companyName="Grupo Polanco">x</PortalShell>);
    expect(screen.getByText("Portal de clientes · Grupo Polanco")).toBeTruthy();
    cleanup();

    render(<PortalShell clientName="Ana López" companyName={null}>x</PortalShell>);
    expect(screen.getByText("Portal de clientes")).toBeTruthy();
    expect(screen.queryByText(/Portal de clientes ·/)).toBeNull();
  });

  it("hides the client name and Salir on the public portal pages", () => {
    render(<PortalShell clientName={null} companyName={null}>login</PortalShell>);

    expect(screen.queryByRole("link", { name: "Salir" })).toBeNull();
    expect(screen.getByRole("link", { name: "Cincel, inicio del portal" })).toBeTruthy();
  });

  it("puts the project menu and the style switch in the bar, and leaves the width to each page", () => {
    render(
      <PortalShell
        clientName="Un nombre de cliente muy largo para una pantalla pequeña"
        companyName={null}
        projectMenu={<div data-testid="menu" />}
        styleSwitch={<div data-testid="switch" />}
      >
        <PortalPageColumn>x</PortalPageColumn>
      </PortalShell>,
    );

    const header = screen.getByRole("banner");
    expect(header.contains(screen.getByTestId("menu"))).toBe(true);
    expect(header.contains(screen.getByTestId("switch"))).toBe(true);
    // Header wraps instead of scrolling sideways at 390 px.
    expect(header.firstElementChild?.className).toContain("flex-wrap");
    const main = screen.getByRole("main");
    expect(main.className).not.toContain("max-w-3xl");
    expect(main.firstElementChild?.className).toContain("max-w-3xl");
    expect(screen.getByText(/Un nombre de cliente/).className).toContain("truncate");
  });
});

describe("PortalProjectMenu", () => {
  it("reads the project id from the project page only", () => {
    expect(portalProjectIdFromPath("/portal/proyectos/p1")).toBe("p1");
    expect(portalProjectIdFromPath("/portal/proyectos/p1/")).toBe("p1");
    expect(portalProjectIdFromPath("/portal")).toBeNull();
    expect(portalProjectIdFromPath("/portal/proyectos/p1/otro")).toBeNull();
    expect(portalProjectIdFromPath(null)).toBeNull();
  });

  it("project menu only on project pages", async () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.portal.projects(), { projects: [dto("p1", "Oficina Polanco"), dto("p2", "Casa Lomas")] });

    nav.pathname = "/portal";
    const home = renderWithQueryClient(<PortalProjectMenu />, { client });
    expect(home.container.innerHTML).toBe("");
    cleanup();

    nav.pathname = "/portal/proyectos/p1";
    nav.search = "tab=archivos";
    renderWithQueryClient(<PortalProjectMenu />, { client });
    const trigger = screen.getByRole("button", { name: /Oficina Polanco/ });
    await act(async () => {
      fireEvent.click(trigger);
    });
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Oficina Polanco", "Casa Lomas"]);
    // Each keeps the current tab; the current project is marked.
    expect(items[1].getAttribute("href")).toBe("/portal/proyectos/p2?tab=archivos");
    expect(items[0].getAttribute("aria-current")).toBe("page");
    expect(items[1].getAttribute("aria-current")).toBeNull();
  });

  it("single project renders text", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.portal.projects(), { projects: [dto("p1", "Oficina Polanco")] });
    nav.pathname = "/portal/proyectos/p1";

    renderWithQueryClient(<PortalProjectMenu />, { client });
    expect(screen.getByText("Oficina Polanco").tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("PortalShell logout", () => {
  it("clears the whole query cache on Salir: client B never sees client A's projects", () => {
    const client = createTestQueryClient();
    setBrowserQueryClient(client);
    // Client A's cache.
    client.setQueryData(qk.portal.projects(), { projects: [{ id: "pa" }] });
    client.setQueryData(qk.portal.project("pa", "resumen"), { project: { id: "pa" } });
    client.setQueryData(qk.portal.uploads("pa"), [{ id: "u1" }]);

    render(<PortalShell clientName="Cliente A" companyName={null}>x</PortalShell>);
    const salir = screen.getByRole("link", { name: "Salir" });
    // The anchor still navigates to the logout route; only the default navigation is stopped in the test.
    salir.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(salir);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    cleanup();

    // Client B signs in in the same tab: the cache starts empty.
    render(<PortalShell clientName="Cliente B" companyName={null}>y</PortalShell>);
    expect(client.getQueryData(qk.portal.projects())).toBeUndefined();
    expect(client.getQueryData(qk.portal.project("pa", "resumen"))).toBeUndefined();
  });
});
