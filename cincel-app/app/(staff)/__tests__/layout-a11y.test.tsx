// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_IDS } from "@/lib/ui/themes";

const mocks = vi.hoisted(() => ({
  getSessionAccess: vi.fn(),
  getResolvedAppearance: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: mocks.getSessionAccess }));
vi.mock("@/lib/ui/preferences-server", () => ({ getResolvedAppearance: mocks.getResolvedAppearance }));
vi.mock("@/lib/ui/nav", () => ({ buildNavModel: async () => ({ items: [], tramos: [], footer: [] }) }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({
  fetchMyTodayAction: async () => ({ enabled: false }),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/repositories/preferences-repository", () => ({ findStaffPhoto: async () => null }));
vi.mock("@/components/layout/Sidebar", () => ({
  default: () => (
    <nav aria-label="Menú principal">
      <a href="/dashboard">Dashboard</a>
    </nav>
  ),
}));
vi.mock("@/components/layout/Header", () => ({
  default: () => (
    <header>
      <button type="button">Cerrar sesión</button>
    </header>
  ),
}));
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div>
      <nav aria-label="Navegación">
        <a href="/inicio">Inicio</a>
      </nav>
      <main>{children}</main>
    </div>
  ),
}));

import { LegacyFrame } from "@/components/shell/LegacyFrame";
import StaffLayout from "../layout";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

const page = (
  <LegacyFrame>
    <h1>Proyectos</h1>
  </LegacyFrame>
);

const CASES = THEME_IDS.flatMap((theme) => (["light", "dark"] as const).map((mode) => [theme, mode] as const));

beforeEach(() => {
  mocks.getSessionAccess.mockResolvedValue({
    status: "active",
    user: { id: "staff-1", name: "Ana López", role: "Diseño", access: "Colaborador" },
  });
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
});

describe("app/(staff)/layout accessibility", () => {
  it.each(CASES)("%s / %s: no serious or critical axe violations, flag off and on", async (theme, mode) => {
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.setAttribute("data-theme-id", theme);

    for (const redesignEnabled of [false, true]) {
      mocks.getResolvedAppearance.mockResolvedValue({
        theme,
        mode,
        style: "visual",
        density: "comoda",
        textSize: 14,
        redesignEnabled,
        cssVars: { light: {}, dark: {} },
        version: 1,
      });
      const { container, unmount } = render(await StaffLayout({ children: page }));
      expect(await seriousViolations(container)).toEqual([]);
      unmount();
    }
  });
});
