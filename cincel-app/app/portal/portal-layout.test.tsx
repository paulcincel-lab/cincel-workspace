// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
const getPortalUser = vi.hoisted(() => vi.fn());
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "cincel_portal_session" && state.cookie ? { name, value: state.cookie } : undefined,
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/portal/session", () => ({ getPortalUser }));

import PortalLayout from "./layout";
import PortalNotFound from "./not-found";
import PortalError from "./error";
import PortalMissingPage from "./[...missing]/page";

describe("portal layout", () => {
  beforeEach(() => {
    state.cookie = undefined;
    getPortalUser.mockReset();
  });
  afterEach(cleanup);

  it("renders the bare shell without a portal cookie and never checks the session", async () => {
    render(await PortalLayout({ children: <p>login</p> }));

    expect(getPortalUser).not.toHaveBeenCalled();
    expect(screen.getByText("login")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Salir" })).toBeNull();
  });

  it("validates the cookie and shows the client name with Salir", async () => {
    state.cookie = "token";
    getPortalUser.mockResolvedValue({ id: "u1", name: "Ana López", email: "ana@example.com" });

    render(await PortalLayout({ children: <p>proyectos</p> }));

    expect(getPortalUser).toHaveBeenCalledOnce();
    expect(screen.getByText("Ana López")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Salir" }).getAttribute("href")).toBe(
      "/api/portal/auth/logout?next=%2Fportal%2Flogin",
    );
  });

  it("renders the bare shell for a stale cookie instead of redirecting, so the magic link keeps its token", async () => {
    state.cookie = "stale";
    getPortalUser.mockResolvedValue(null);

    render(await PortalLayout({ children: <p>acceder</p> }));

    expect(getPortalUser).toHaveBeenCalledOnce();
    expect(screen.getByText("acceder")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Salir" })).toBeNull();
  });
});

describe("portal 404 and error pages", () => {
  afterEach(cleanup);

  it("404 is in Spanish and links back to /portal", () => {
    render(<PortalNotFound />);

    expect(screen.getByRole("heading", { name: "No encontramos esta página" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver a mis proyectos" }).getAttribute("href")).toBe("/portal");
  });

  it("unknown /portal paths call notFound()", () => {
    expect(() => PortalMissingPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("error page is in Spanish, hides the message and retries with reset", () => {
    const reset = vi.fn();
    render(<PortalError error={Object.assign(new Error("db exploded"), { digest: "abc123" })} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.queryByText(/db exploded/)).toBeNull();
    expect(screen.getByText(/Referencia: abc123/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Intentar de nuevo" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "Volver a mis proyectos" }).getAttribute("href")).toBe("/portal");
  });
});
