// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { THEME_IDS } from "@/lib/ui/themes";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionAccess: async () => ({ status: "guest", user: null }),
}));
vi.mock("@/lib/auth/auth-actions", () => ({ loginAction: vi.fn() }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () => ({ redesignEnabled: false }),
}));
vi.mock("@/lib/repositories/app-settings-repository", () => ({
  getAppSettingEntry: async () => ({
    value: JSON.stringify({ version: 1, data: { redesignDefault: true, redesignAvailable: true } }),
    updatedAt: new Date(),
  }),
}));
vi.mock("@/lib/settings/general-settings-server", () => ({
  getGeneralSettings: async () => ({
    settings: { company: { contactEmail: "admin@example.test" } },
    hasCustom: true,
    savedAt: null,
  }),
}));

import LoginDeniedPage from "./denegado/page";
import LoginPage from "./page";

const MODES = ["light", "dark"] as const;

/** Applies the theme the way the root layout does for flag-on pages (FE §14.1). */
function applyTheme(themeId: string, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", themeId);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

/**
 * Serious and critical axe violations. Color contrast needs real layout and
 * computed colors (not available in happy-dom); the pages use theme tokens only
 * and every preset's pairs are checked by `lib/ui/contrast.ts`.
 */
async function seriousViolations() {
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  document.body.innerHTML = "";
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

const CASES = THEME_IDS.flatMap((theme) => MODES.map((mode) => [theme, mode] as const));

describe("auth pages accessibility (redesign)", () => {
  it.each(CASES)("/login has no serious axe violations (%s, %s)", async (theme, mode) => {
    vi.stubEnv("AUTH_GOOGLE_ENABLED", "true");
    vi.stubEnv("AUTH_PASSWORD_ENABLED", "true");
    applyTheme(theme, mode);
    render(await LoginPage({ searchParams: Promise.resolve({ error: "retry" }) }));

    expect(document.querySelector("[data-testid='auth-split-layout']")).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  it.each(CASES)("/login/denegado has no serious axe violations (%s, %s)", async (theme, mode) => {
    applyTheme(theme, mode);
    render(
      await LoginDeniedPage({
        searchParams: Promise.resolve({ motivo: "domain", email: "persona@gmail.com" }),
      }),
    );

    expect(document.querySelector("[data-testid='auth-centered-layout']")).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });
});
