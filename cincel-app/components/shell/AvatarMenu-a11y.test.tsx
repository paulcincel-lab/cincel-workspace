// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CSSProperties } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
vi.mock("@/lib/actions/preferences-actions.flags", () => ({
  IMPLEMENTED: { fetchMyPreferencesAction: true, updateMyPreferencesAction: true },
}));
vi.mock("@/lib/actions/profile-photo-actions", () => ({ removeMyPhotoAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/actions/profile-photo-actions.flags", () => ({ IMPLEMENTED: { removeMyPhotoAction: true } }));
vi.mock("@/lib/auth/auth-actions", () => ({ logoutAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/settings/use-general-settings", async () => {
  const { buildDefaultGeneralSettings } = await import("@/lib/settings/general-settings");
  return {
    useGeneralSettings: () => {
      const base = buildDefaultGeneralSettings();
      return {
        ...base,
        company: { ...base.company, instagramUrl: "https://instagram.com/cincel", contactEmail: "hola@cincel.mx" },
      };
    },
  };
});

import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId, TokenName } from "@/lib/types/redesign";

import { SidebarUserBlock } from "./SidebarUserBlock";

const MODES = ["light", "dark"] as const;

/** Token pairs the user block and the open menu draw with. */
const MENU_PAIRS = [
  "sidebar-foreground/sidebar",
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "ring/background",
];

const session = { staffId: "s1", name: "Ana López", role: "Administrador", isAdmin: true, photoUrl: "/api/staff/s1/photo?v=1" };

function themeVars(theme: ThemeId, mode: (typeof MODES)[number]): Record<string, string> {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of Object.keys(tokens) as TokenName[]) vars[`--${name}`] = tokens[name][mode];
  return vars;
}

async function seriousViolations(root: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // the token pairs are checked with checkContrast below.
  // Base UI's focus-trap sentinels (aria-hidden, tabindex 0) only bounce focus
  // back into the open menu; they are library internals, not page content.
  const results = await axe.run(
    { include: [root], exclude: [["[data-base-ui-focus-guard]"]] },
    { rules: { "color-contrast": { enabled: false } } },
  );
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function trigger() {
  return screen.getByRole("button", { name: /Menú de la cuenta de Ana López/ });
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("AvatarMenu accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations, closed and open (${theme}, ${mode})`, async () => {
        render(
          <aside
            aria-label="Barra lateral"
            data-theme={mode}
            data-theme-id={theme}
            className={mode === "dark" ? "dark" : undefined}
            style={themeVars(theme, mode) as CSSProperties}
          >
            <SidebarUserBlock session={session} />
          </aside>,
        );
        expect(await seriousViolations(document.body)).toEqual([]);
        fireEvent.click(trigger());
        await screen.findByRole("menu");
        expect(await seriousViolations(document.body)).toEqual([]);
      });

      it(`passes the shared contrast pairs it uses (${theme}, ${mode})`, () => {
        const pairs = CONTRAST_PAIRS.filter((p) => MENU_PAIRS.includes(p.pair)).map((p) => p.pair);
        expect(pairs.sort()).toEqual([...MENU_PAIRS].sort());
        const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => MENU_PAIRS.includes(r.pair));
        expect(results).toHaveLength(MENU_PAIRS.length);
        expect(results.filter((r) => !r.ok)).toEqual([]);
      });
    }
  }

  it("is keyboard operable with a visible focus style", async () => {
    render(<SidebarUserBlock session={session} />);
    const button = trigger();
    expect(button.tagName).toBe("BUTTON");
    expect(button.className).toContain("focus-visible:");
    expect(button.getAttribute("aria-haspopup")).toBe("menu");

    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    const menu = await screen.findByRole("menu");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(0);
    items[0].focus();
    fireEvent.keyDown(document.activeElement ?? menu, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(items[1]));

    fireEvent.keyDown(document.activeElement ?? menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("links the name to the profile page", () => {
    render(<SidebarUserBlock session={session} />);
    expect(screen.getByRole("link", { name: "Ana López" }).getAttribute("href")).toBe("/ajustes/perfil");
    expect(screen.getByText("Administrador")).toBeTruthy();
  });
});
