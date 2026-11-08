// @vitest-environment happy-dom
import { cleanup } from "@testing-library/react";
import type { ReactElement } from "react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  search: { searchWorkspaceAction: true },
  time: { clockInAction: true },
}));

// The avatar reads me.profile from the query cache; these tests render it without one.
vi.mock("@/components/shell/photo-upload", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shell/photo-upload")>()),
  useMyProfile: (initial: unknown) => initial,
  usePhotoUploadMutation: () => ({ mutateAsync: async () => "" }),
  useRemovePhotoMutation: () => ({ mutateAsync: async () => undefined }),
}));
// The Sidebar reads the company settings from the query cache; these tests render it without one.
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { GENERAL_SETTINGS_DEFAULTS } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => GENERAL_SETTINGS_DEFAULTS };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(),
  // The user block's avatar menu routes on sign-out and photo changes.
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
// Every optional entry point on, so the axe run covers the fullest sidebar.
vi.mock("@/lib/actions/search-actions.flags", () => ({ IMPLEMENTED: state.search }));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({ IMPLEMENTED: state.time }));
// The overlays mounted next to the sidebar have their own a11y tests.
vi.mock("@/components/shell/CommandPalette", () => ({ CommandPalette: () => null }));
vi.mock("@/components/shell/BottomTabs", () => ({ BottomTabs: () => null }));
vi.mock("@/components/asistente/AssistantButton", () => ({ AssistantButton: () => null }));
vi.mock("@/components/asistente/AssistantSheet", () => ({ AssistantSheet: () => null }));

import { AppShellClient } from "../AppShellClient";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import { toClientNavModel } from "@/lib/ui/nav-client";

import { ADMIN_SESSION, FULL_NAV, STAFF_SESSION, TODAY_ON } from "./shell-fixtures";

const MODES = ["light", "dark"] as const;

/** Renders with the cache the `(staff)` layout hydrates (badges and the day), so nothing is fetched. */
function render(ui: ReactElement) {
  const client = createTestQueryClient();
  client.setQueryData(qk.shell.badges(), { tareasOpen: 31, bandeja: { unreadCount: 5, dueReminders: [] } });
  client.setQueryData(qk.me.today(), TODAY_ON);
  return renderWithQueryClient(ui, { client });
}

/** The token pairs the sidebar paints text with. */
const SIDEBAR_PAIRS = CONTRAST_PAIRS.filter((p) => p.pair.startsWith("sidebar-")).map((p) => p.pair);

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide;
  // the token pairs are checked with checkContrast below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyAppearance(themeId: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", themeId);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("Sidebar accessibility", () => {
  it("covers both sidebar text pairs of CONTRAST_PAIRS", () => {
    expect(SIDEBAR_PAIRS).toEqual(["sidebar-foreground/sidebar", "sidebar-primary-foreground/sidebar-primary"]);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations (${themeId}, ${mode})`, async () => {
        applyAppearance(themeId, mode);
        const { container } = render(
          <AppShellClient
            nav={toClientNavModel(FULL_NAV)}
            session={ADMIN_SESSION}
            today={TODAY_ON}
            slots={{ "time-clock": <section aria-label="Registro de jornada" /> }}
          >
            <h1>Tareas</h1>
          </AppShellClient>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`sidebar text and the active item pass contrast (${themeId}, ${mode})`, () => {
        const results = checkContrast(THEME_PRESETS[themeId].tokens, mode).filter((r) => SIDEBAR_PAIRS.includes(r.pair));
        expect(results).toHaveLength(SIDEBAR_PAIRS.length);
        expect(results.filter((r) => !r.ok)).toEqual([]);
      });
    }
  }

  it("has no serious or critical axe violations for a non-admin with an empty nav", async () => {
    applyAppearance("azul", "light");
    const { container } = render(
      <AppShellClient nav={{ items: [], tramos: [], footer: [] }} session={STAFF_SESSION} today={null}>
        <h1>Proyectos</h1>
      </AppShellClient>,
    );
    expect(await seriousViolations(container)).toEqual([]);
  });
});
