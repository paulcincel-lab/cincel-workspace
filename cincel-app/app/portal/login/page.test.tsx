// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getPortalAppearance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal/appearance", () => ({ getPortalAppearance }));

import PortalLoginPage from "./page";

function appearance(redesignEnabled: boolean) {
  return {
    theme: "azul",
    mode: "system",
    style: "visual",
    density: "comoda",
    textSize: 14,
    redesignEnabled,
    cssVars: { light: {}, dark: {} },
    version: 1,
  };
}

beforeEach(() => {
  getPortalAppearance.mockReset();
  getPortalAppearance.mockResolvedValue(appearance(false));
});
afterEach(cleanup);

describe("/portal/login", () => {
  it("passes ?error=link and ?email= to the form", async () => {
    render(await PortalLoginPage({ searchParams: Promise.resolve({ error: "link", email: "ana@example.com" }) }));

    expect(screen.getByText("El enlace ya no es válido. Pide uno nuevo.")).toBeTruthy();
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("shows no error for other values", async () => {
    render(await PortalLoginPage({ searchParams: Promise.resolve({ error: "otro" }) }));

    expect(screen.queryByText("El enlace ya no es válido. Pide uno nuevo.")).toBeNull();
  });

  it("renders today's card with the redesign off", async () => {
    render(await PortalLoginPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Entra al portal")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeTruthy();
  });

  it("renders the restyled card with the redesign on, keeping ?error= and ?email=", async () => {
    getPortalAppearance.mockResolvedValue(appearance(true));

    render(await PortalLoginPage({ searchParams: Promise.resolve({ error: "link", email: "ana@example.com" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Bienvenido a tu proyecto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar enlace de acceso" })).toBeTruthy();
    expect(screen.getByText("El enlace ya no es válido. Pide uno nuevo.")).toBeTruthy();
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@example.com");
  });
});
