// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import PortalLoginPage from "./page";

afterEach(cleanup);

describe("/portal/login", () => {
  it("renders the card of canvas PortalLogin, keeping ?error= and ?email=", async () => {
    render(await PortalLoginPage({ searchParams: Promise.resolve({ error: "link", email: "ana@example.com" }) }));

    expect(screen.getByRole("heading", { level: 1, name: "Bienvenido a tu proyecto" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enviar enlace de acceso" })).toBeTruthy();
    expect(screen.getByText("El enlace ya no es válido. Pide uno nuevo.")).toBeTruthy();
    expect((screen.getByLabelText("Correo") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("shows no error for other values", async () => {
    render(await PortalLoginPage({ searchParams: Promise.resolve({ error: "otro" }) }));

    expect(screen.queryByText("El enlace ya no es válido. Pide uno nuevo.")).toBeNull();
  });
});
