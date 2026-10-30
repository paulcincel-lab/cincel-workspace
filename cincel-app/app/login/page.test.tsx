// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { SessionAccess } from "@/lib/auth/session";

const session = vi.hoisted(() => ({
  value: { status: "guest", user: null } as SessionAccess,
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);

vi.mock("next/navigation", () => ({
  redirect,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: async () => session.value,
}));
vi.mock("@/lib/auth/auth-actions", () => ({ loginAction: vi.fn() }));

import LoginPage from "./page";

async function renderLogin(params: { error?: string | string[] } = {}) {
  render(await LoginPage({ searchParams: Promise.resolve(params) }));
}

function setFlags(google: string | undefined, password: string | undefined) {
  if (google === undefined) delete process.env.AUTH_GOOGLE_ENABLED;
  else process.env.AUTH_GOOGLE_ENABLED = google;
  if (password === undefined) delete process.env.AUTH_PASSWORD_ENABLED;
  else process.env.AUTH_PASSWORD_ENABLED = password;
}

const googleLink = () =>
  screen.queryByText("Entrar con Google")?.closest("a") ?? null;
const passwordInput = () => screen.queryByPlaceholderText("••••••••");
const divider = () => screen.queryByText("o con contraseña");

describe("/login", () => {
  const original = {
    google: process.env.AUTH_GOOGLE_ENABLED,
    password: process.env.AUTH_PASSWORD_ENABLED,
  };

  beforeEach(() => {
    session.value = { status: "guest", user: null };
    redirect.mockClear();
  });

  afterEach(() => {
    cleanup();
    setFlags(original.google, original.password);
  });

  it("defaults (flags unset): password form only, as before", async () => {
    setFlags(undefined, undefined);
    await renderLogin();
    expect(passwordInput()).not.toBeNull();
    expect(screen.getByRole("button", { name: /^Entrar/ })).not.toBeNull();
    expect(googleLink()).toBeNull();
    expect(divider()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Google on, password on: Google link, divider and password form", async () => {
    setFlags("true", "true");
    await renderLogin();
    expect(googleLink()?.getAttribute("href")).toBe("/api/auth/google/start");
    expect(divider()).not.toBeNull();
    expect(passwordInput()).not.toBeNull();
  });

  it("Google on, password off: Google link only", async () => {
    setFlags("true", "false");
    await renderLogin();
    expect(googleLink()).not.toBeNull();
    expect(divider()).toBeNull();
    expect(passwordInput()).toBeNull();
  });

  it("Google off, password on (explicit): password form only", async () => {
    setFlags("false", "true");
    await renderLogin();
    expect(googleLink()).toBeNull();
    expect(divider()).toBeNull();
    expect(passwordInput()).not.toBeNull();
  });

  it("both off: no sign-in method, an Alert explains it", async () => {
    setFlags("false", "false");
    await renderLogin();
    expect(googleLink()).toBeNull();
    expect(passwordInput()).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "El inicio de sesión no está disponible.",
    );
  });

  it.each([
    ["state", "La sesión de inicio expiró. Intenta de nuevo."],
    ["retry", "No pudimos verificar tu acceso con Google. Intenta de nuevo."],
  ])("?error=%s shows its Alert", async (error, message) => {
    setFlags("true", "true");
    await renderLogin({ error });
    expect(screen.getByRole("alert").textContent).toBe(message);
  });

  it("ignores unknown ?error= values", async () => {
    setFlags("true", "true");
    await renderLogin({ error: "<b>otro</b>" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("redirects an active session to /dashboard", async () => {
    session.value = {
      status: "active",
      user: { id: "staff-1" },
    } as SessionAccess;
    await expect(renderLogin()).rejects.toThrow("NEXT_REDIRECT /dashboard");
  });

  it.each([
    "pending_first_access",
    "inactive_member",
    "no_system_access",
  ] as const)("does not redirect a %s session", async (status) => {
    session.value = { status, user: null } as SessionAccess;
    await renderLogin();
    expect(redirect).not.toHaveBeenCalled();
  });
});
