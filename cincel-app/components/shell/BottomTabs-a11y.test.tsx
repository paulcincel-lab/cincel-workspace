// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CSSProperties, ReactElement } from "react";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { BookOpen, Folder, House, Inbox, SlidersHorizontal, Sparkles, SquareCheck, Users } from "lucide-react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/mi-espacio",
}));
vi.mock("./TimeClock", () => ({
  TimeClock: () => <span role="timer" aria-live="off">05:12</span>,
}));
vi.mock("./AvatarMenu", () => ({
  AvatarMenu: ({ session }: { session: { name: string } }) => (
    <button type="button" data-slot="dropdown-menu-trigger" aria-label={`Menú de la cuenta de ${session.name}`}>
      AL
    </button>
  ),
}));

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { splitBottomTabs } from "@/lib/ui/mobile-nav";
import type { NavModel } from "@/lib/ui/nav";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { ThemeId, TokenName } from "@/lib/types/redesign";

import { BottomTabs } from "./BottomTabs";
import { MobileTopBar } from "./MobileTopBar";

const MODES = ["light", "dark"] as const;

/** Token pairs the tabs, the Más sheet and the compact top bar draw with. */
const MOBILE_PAIRS = [
  "sidebar-foreground/sidebar",
  "sidebar-primary-foreground/sidebar-primary",
  "primary-foreground/primary",
  "foreground/background",
  "ring/background",
];

const NAV: NavModel = {
  items: [
    { key: "inicio", label: "Inicio", href: "/inicio", icon: House },
    { key: "mi-espacio", label: "Mi espacio", href: "/mi-espacio", icon: Inbox, badge: 5 },
    { key: "tareas", label: "Tareas", href: "/tareas", icon: SquareCheck, badge: 31 },
    { key: "proyectos", label: "Proyectos", href: "/proyectos", icon: Folder },
    { key: "personas", label: "Personas", href: "/personas", icon: Users },
    { key: "biblioteca", label: "Biblioteca", href: "/biblioteca", icon: BookOpen },
    { key: "asistente", label: "Asistente", href: "/asistente", icon: Sparkles },
  ],
  tramos: [],
  footer: [{ key: "ajustes", label: "Ajustes", href: "/ajustes", icon: SlidersHorizontal }],
};

const TABS = splitBottomTabs(NAV);
const session = { staffId: "s1", name: "Ana López", role: "Administrador", isAdmin: true, photoUrl: null };

function themeVars(theme: ThemeId, mode: (typeof MODES)[number]): Record<string, string> {
  const tokens = THEME_PRESETS[theme].tokens;
  const vars: Record<string, string> = {};
  for (const name of Object.keys(tokens) as TokenName[]) vars[`--${name}`] = tokens[name][mode];
  return vars;
}

async function seriousViolations(root: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // the token pairs are checked with checkContrast below.
  const results = await axe.run(root, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function mockPhoneViewport() {
  const matchMedia = vi.fn((query: string) => ({
    matches: /max-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => true,
  }));
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: matchMedia });
}

/** Renders with the badges the `(staff)` layout hydrates (Mi espacio 5, Tareas 31). */
function render(ui: ReactElement) {
  const client = createTestQueryClient();
  client.setQueryData(qk.shell.badges(), { tareasOpen: 31, bandeja: { unreadCount: 5, dueReminders: [] } });
  return renderWithQueryClient(ui, { client });
}

function MobileChrome() {
  return (
    <>
      <MobileTopBar session={session} today={null} />
      <main>
        <h1>Mi espacio</h1>
      </main>
      <BottomTabs activeKey="mi-espacio" items={TABS.items} more={TABS.more} />
    </>
  );
}

beforeEach(() => {
  mockPhoneViewport();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("BottomTabs and MobileTopBar accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious or critical axe violations, closed and with Más open (${theme}, ${mode})`, async () => {
        render(
          <div
            data-theme={mode}
            data-theme-id={theme}
            className={mode === "dark" ? "dark" : undefined}
            style={themeVars(theme, mode) as CSSProperties}
          >
            <MobileChrome />
          </div>,
        );
        expect(await seriousViolations(document.body)).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: /Más/ }));
        await screen.findByRole("dialog");
        expect(await seriousViolations(document.body)).toEqual([]);
      });

      it(`passes the shared contrast pairs it uses (${theme}, ${mode})`, () => {
        const pairs = CONTRAST_PAIRS.filter((p) => MOBILE_PAIRS.includes(p.pair)).map((p) => p.pair);
        expect(pairs.sort()).toEqual([...MOBILE_PAIRS].sort());
        const results = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => MOBILE_PAIRS.includes(r.pair));
        expect(results).toHaveLength(MOBILE_PAIRS.length);
        expect(results.filter((r) => !r.ok)).toEqual([]);
      });
    }
  }

  it("labels the tab bar and marks the current tab", () => {
    render(<MobileChrome />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(nav.querySelector("[aria-current=page]")?.textContent).toContain("Mi espacio");
    for (const icon of nav.querySelectorAll("svg")) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("announces badges as text, not only as a colored count", () => {
    render(<MobileChrome />);
    expect(screen.getByRole("link", { name: /Mi espacio, 5 pendientes/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Tareas, 31 pendientes/ })).toBeTruthy();
  });

  it("has a visible focus style on every tab and on Más", () => {
    render(<MobileChrome />);
    const nav = screen.getByRole("navigation", { name: "Navegación principal" });
    for (const target of nav.querySelectorAll("a, button")) {
      expect(target.className).toContain("focus-visible:ring-2");
    }
  });

  it("opens Más from the keyboard, traps focus in the sheet and returns it on Escape", async () => {
    render(<MobileChrome />);
    const more = screen.getByRole("button", { name: /Más/ });
    expect(more.tagName).toBe("BUTTON");
    more.focus();
    fireEvent.click(more);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.getAttribute("aria-labelledby")).toBeTruthy();
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? sheet, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(more));
  });
});
