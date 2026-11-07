// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import axe from "axe-core";

const state = vi.hoisted(() => ({ redesignEnabled: true }));

vi.mock("next/navigation", () => ({ usePathname: () => "/proyectos" }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => ({ redesignEnabled: state.redesignEnabled })),
}));
vi.mock("@/lib/actions/search-actions.flags", () => ({ IMPLEMENTED: { searchWorkspaceAction: true } }));
vi.mock("@/components/shell/CommandPalette", () => ({ CommandPalette: () => null }));

import NotFound from "@/app/not-found";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { PermissionDenied } from "@/components/shell/PermissionDenied";
import { RouteError } from "@/components/shell/RouteError";
import { RouteLoading } from "@/components/shell/RouteLoading";
import { THEME_IDS } from "@/lib/ui/themes";

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide;
  // token pairs are covered by CONTRAST_PAIRS / checkContrast in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function applyTheme(theme: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", theme);
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-style", "visual");
  html.classList.toggle("dark", mode === "dark");
}

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  delete (window.navigator as { onLine?: boolean }).onLine;
  vi.restoreAllMocks();
  const html = document.documentElement;
  for (const attr of ["data-theme-id", "data-theme", "data-style"]) html.removeAttribute(attr);
  html.classList.remove("dark");
});

const MODES = ["light", "dark"] as const;

describe("route states accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`not-found has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(await NotFound());
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`route error, loading and permission denied have no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(
          <main>
            <RouteError error={Object.assign(new Error("boom"), { digest: "d1" })} reset={() => {}} />
            <RouteLoading />
            <PermissionDenied action={{ label: "Pedir acceso", onClick: () => {} }} />
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`offline banner has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container, getByRole } = render(
          <main>
            <OfflineBanner />
          </main>,
        );
        online = false;
        act(() => {
          window.dispatchEvent(new Event("offline"));
        });
        expect(getByRole("status")).toBeTruthy();
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});
