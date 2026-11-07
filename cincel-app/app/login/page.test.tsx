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

// Org appearance (`app_settings('appearance.theme')`) and the resolved flag of a caller with a user row.
const appearance = vi.hoisted(() => ({
  stored: null as null | { redesignDefault: boolean; redesignAvailable: boolean },
  userRedesign: false,
}));
vi.mock("@/lib/repositories/app-settings-repository", () => ({
  getAppSettingEntry: async (key: string) =>
    key === "appearance.theme" && appearance.stored
      ? { value: JSON.stringify({ version: 1, data: appearance.stored }), updatedAt: new Date() }
      : null,
}));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () => ({ redesignEnabled: appearance.userRedesign }),
}));

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
    appearance.stored = null;
    appearance.userRedesign = false;
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

const continueWithGoogle = () =>
  screen.queryByText("Continuar con Google")?.closest("a") ?? null;

describe("/login look", () => {
  const original = {
    google: process.env.AUTH_GOOGLE_ENABLED,
    password: process.env.AUTH_PASSWORD_ENABLED,
  };

  beforeEach(() => {
    session.value = { status: "guest", user: null };
    appearance.stored = null;
    appearance.userRedesign = false;
    setFlags("true", "true");
  });

  afterEach(() => {
    cleanup();
    setFlags(original.google, original.password);
  });

  it("keeps today's page when the org setting is missing", async () => {
    await renderLogin();
    expect(screen.queryByTestId("auth-split-layout")).toBeNull();
    expect(googleLink()).not.toBeNull();
  });

  it("keeps today's page while redesignDefault is off", async () => {
    appearance.stored = { redesignDefault: false, redesignAvailable: true };
    await renderLogin();
    expect(screen.queryByTestId("auth-split-layout")).toBeNull();
    expect(continueWithGoogle()).toBeNull();
  });

  it("keeps today's page when redesignAvailable is false, even with the default on", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: false };
    await renderLogin();
    expect(screen.queryByTestId("auth-split-layout")).toBeNull();
    expect(googleLink()).not.toBeNull();
  });

  it("renders the split layout with the brand panel and the form card when the org default is on", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    await renderLogin();
    const layout = screen.getByTestId("auth-split-layout");
    expect(layout.querySelector("section[aria-label='Cincel Workspace']")).not.toBeNull();
    expect(screen.getByTestId("auth-brand-pattern").getAttribute("aria-hidden")).toBe("true");
    expect(layout.querySelector("img")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Iniciar sesión" })).not.toBeNull();
    expect(layout.querySelector("[data-slot='card']")).not.toBeNull();
  });

  it("makes Continuar con Google the primary button with a neutral G mark", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    await renderLogin();
    const link = continueWithGoogle();
    expect(link?.getAttribute("href")).toBe("/api/auth/google/start");
    expect(link?.className).toContain("bg-primary");
    const mark = screen.getByTestId("google-mark");
    expect(mark.textContent).toBe("G");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(link?.querySelector("svg")).toBeNull();
    // The submit is secondary next to Google.
    expect(screen.getByRole("button", { name: "Entrar" }).className).not.toContain("bg-primary ");
  });

  it("keeps the credentials form with labelled fields", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    await renderLogin();
    expect(screen.getByLabelText("Correo institucional")).not.toBeNull();
    expect(screen.getByLabelText("Contraseña")).not.toBeNull();
    expect(screen.getByText("o con correo")).not.toBeNull();
  });

  it("hides the Google button and the divider when Google is off", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    setFlags("false", "true");
    await renderLogin();
    expect(continueWithGoogle()).toBeNull();
    expect(screen.queryByText("o con correo")).toBeNull();
    expect(screen.getByRole("button", { name: "Entrar" })).not.toBeNull();
  });

  it("shows the no sign-in Alert on the redesign page too", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    setFlags("false", "false");
    await renderLogin();
    expect(screen.getByRole("alert").textContent).toContain("El inicio de sesión no está disponible.");
  });

  it("shows ?error= Alerts on the redesign page", async () => {
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    await renderLogin({ error: "state" });
    expect(screen.getByRole("alert").textContent).toBe("La sesión de inicio expiró. Intenta de nuevo.");
  });

  it("follows the resolved per-user flag when a user row exists", async () => {
    appearance.stored = { redesignDefault: false, redesignAvailable: true };
    appearance.userRedesign = true;
    session.value = { status: "pending_first_access", user: { id: "staff-1" } } as SessionAccess;
    await renderLogin();
    expect(screen.getByTestId("auth-split-layout")).not.toBeNull();

    cleanup();
    appearance.stored = { redesignDefault: true, redesignAvailable: true };
    appearance.userRedesign = false;
    await renderLogin();
    expect(screen.queryByTestId("auth-split-layout")).toBeNull();
  });
});
