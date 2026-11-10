// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas/clientes",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/actions/contacts-actions", () => ({
  fetchContactAction: vi.fn(() => Promise.resolve(null)),
  fetchContactHistoryAction: vi.fn(() => Promise.resolve([])),
  createContactAction: vi.fn(),
  updateContactAction: vi.fn(),
  deleteContactAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({ fetchCatalogStaff: vi.fn(() => Promise.resolve([])) }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { appearanceStyleBlock, toCssVars } from "@/lib/ui/appearance-css";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
// The tabs read the contact sheet and save through TanStack Query.
import { renderWithQueryClient as render } from "@/lib/query/test-utils";
import type { PersonasContactsTab } from "@/lib/personas/contacts";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

import { PersonasContacts } from "./PersonasContacts";
import { PERSONAS_COUNTS, personasContactsFixture } from "./personas-contacts.fixtures";
import { settle } from "@/tests/helpers/settle";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;
const TABS: PersonasContactsTab[] = ["clientes", "contratistas", "proveedores"];

/** Token pairs these tabs paint text or controls with (subset of `CONTRAST_PAIRS`). */
const PAGE_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "secondary-foreground/secondary",
  "destructive/card",
  "success/card",
  "warning-ink/card",
  "border-strong/card",
  "ring/background",
]);

function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const preset = THEME_PRESETS[theme];
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = appearanceStyleBlock({ light: toCssVars(preset, "light"), dark: toCssVars(preset, "dark") });
  document.head.appendChild(style);
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
}

async function seriousViolations(container: HTMLElement) {
  await settle();
  // Color contrast needs real layout and rendering, which happy-dom doesn't
  // provide; token contrast is checked with `checkContrast` instead.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  resetTheme();
});

describe("Personas contact tabs accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`token pairs used by the tabs pass contrast (${theme}, ${mode})`, () => {
        const used = CONTRAST_PAIRS.filter((p) => PAGE_PAIRS.has(p.pair)).map((p) => p.pair);
        expect(used.length).toBe(PAGE_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => PAGE_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });

      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          applyTheme(theme, mode);
          for (const tab of TABS) {
            const { container, unmount } = render(
              <main>
                <StyleProvider style={style} scope="staff">
                  <PersonasContacts
                    tab={tab}
                    contacts={personasContactsFixture()}
                    counts={PERSONAS_COUNTS}
                    subfilter={tab === "proveedores" ? "contratistas" : null}
                    capabilities={{ canCreate: true, canEdit: true, canDelete: true, isAdmin: false }}
                  />
                </StyleProvider>
              </main>,
            );
            expect(await seriousViolations(container)).toEqual([]);
            unmount();
          }
        });
      }

      it(`empty state has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(
          <main>
            <PersonasContacts
              tab="clientes"
              contacts={[]}
              counts={{ ...PERSONAS_COUNTS, clientes: 0 }}
              subfilter={null}
              capabilities={{ canCreate: true, canEdit: true, canDelete: true, isAdmin: false }}
            />
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
