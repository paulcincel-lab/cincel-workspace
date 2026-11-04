// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import PortalShell, { PORTAL_SIGN_OUT_URL } from "./PortalShell";

afterEach(cleanup);

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
