// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { setBrowserQueryClient } from "@/lib/query/reset-client-state";
import { createTestQueryClient } from "@/lib/query/test-utils";

import PortalShell, { PORTAL_SIGN_OUT_URL } from "./PortalShell";

afterEach(() => {
  cleanup();
  setBrowserQueryClient(null);
});

describe("PortalShell", () => {
  it("shows the logo, the client name and Salir pointing at the logout route", () => {
    render(<PortalShell clientName="Ana López">contenido</PortalShell>);

    expect(screen.getByRole("link", { name: "Cincel, inicio del portal" }).getAttribute("href")).toBe("/portal");
    expect(screen.getByText("Ana López")).toBeTruthy();
    const salir = screen.getByRole("link", { name: "Salir" });
    expect(salir.getAttribute("href")).toBe(PORTAL_SIGN_OUT_URL);
    expect(PORTAL_SIGN_OUT_URL).toBe("/api/portal/auth/logout?next=%2Fportal%2Flogin");
    expect(screen.getByRole("main").textContent).toBe("contenido");
  });

  it("hides the client name and Salir on the public portal pages", () => {
    render(<PortalShell clientName={null}>login</PortalShell>);

    expect(screen.queryByRole("link", { name: "Salir" })).toBeNull();
    expect(screen.getByRole("link", { name: "Cincel, inicio del portal" })).toBeTruthy();
  });

  it("keeps a single max-w-3xl column for phones (360 px)", () => {
    window.innerWidth = 360;
    render(<PortalShell clientName="Un nombre de cliente muy largo para una pantalla pequeña">x</PortalShell>);

    const main = screen.getByRole("main");
    expect(main.className).toContain("max-w-3xl");
    expect(main.className).toContain("w-full");
    expect(main.className).toContain("px-4");
    expect(screen.getByText(/Un nombre de cliente/).className).toContain("truncate");
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

    render(<PortalShell clientName="Cliente A">x</PortalShell>);
    const salir = screen.getByRole("link", { name: "Salir" });
    // The anchor still navigates to the logout route; only the default navigation is stopped in the test.
    salir.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(salir);

    expect(client.getQueryCache().getAll()).toHaveLength(0);
    cleanup();

    // Client B signs in in the same tab: the cache starts empty.
    render(<PortalShell clientName="Cliente B">y</PortalShell>);
    expect(client.getQueryData(qk.portal.projects())).toBeUndefined();
    expect(client.getQueryData(qk.portal.project("pa", "resumen"))).toBeUndefined();
  });
});
