// @vitest-environment happy-dom
/**
 * Accessibility of the flag-on root layout in the three themes, light and
 * dark: no serious or critical axe violations in the rendered document, and
 * every color pair of the resolved tokens passes `checkContrast`
 * (`CONTRAST_PAIRS`, BE §5.5). happy-dom has no layout, so axe's own
 * color-contrast rule is off and the token pairs are checked instead.
 */
import axe from "axe-core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ThemeId } from "@/lib/types/redesign";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import { appearanceFor, appearanceState } from "./root-layout-mocks";

vi.mock("next/font/google", async () => (await import("./root-layout-mocks")).fontMock);
vi.mock("@/components/auth/AppRouteGuard", async () => (await import("./root-layout-mocks")).passthroughDefaultMock);
vi.mock("@/components/auth/SessionHydrator", async () => (await import("./root-layout-mocks")).hydratorMock);
vi.mock("@/components/providers/QueryProvider", async () => (await import("./root-layout-mocks")).passthroughDefaultMock);
vi.mock("@/lib/auth/session-context", async () => (await import("./root-layout-mocks")).sessionContextMock);
vi.mock("@/lib/auth/session", async () => (await import("./root-layout-mocks")).sessionMock);
vi.mock("@/lib/settings/general-settings", async () => (await import("./root-layout-mocks")).generalSettingsMock);
vi.mock("@/lib/settings/general-settings-server", async () => (await import("./root-layout-mocks")).generalSettingsServerMock);
vi.mock("@/lib/settings/use-general-settings", async () => (await import("./root-layout-mocks")).useGeneralSettingsMock);
vi.mock("@/lib/theme/primary-color-server", async () => (await import("./root-layout-mocks")).primaryColorServerMock);
vi.mock("@/lib/ui/preferences-server", async () => (await import("./root-layout-mocks")).preferencesServerMock);
vi.mock("@/lib/actions/preferences-actions", async () => (await import("./root-layout-mocks")).preferencesActionsMock);
vi.mock("@/components/ui/shadcn/sonner", async () => (await import("./root-layout-mocks")).toasterMock);
vi.mock("../globals.css", async () => (await import("./root-layout-mocks")).cssMock);

const HTML_ATTRIBUTES = ["lang", "class", "data-theme", "data-mode", "data-theme-id", "data-style", "data-density"];

/** Renders the flag-on layout and mounts its <html> attributes, head styles and body into the live document. */
async function mountLayout(theme: ThemeId, mode: "light" | "dark") {
  appearanceState.value = appearanceFor(theme, { redesignEnabled: true, mode });
  const { default: RootLayout } = await import("../layout");
  const markup = renderToStaticMarkup(
    await RootLayout({
      children: (
        <main>
          <h1>Inicio</h1>
          <p>Resumen del día</p>
          <button type="button">Nueva tarea</button>
        </main>
      ),
    }),
  );
  const parsed = new DOMParser().parseFromString(`<!doctype html>${markup}`, "text/html");
  for (const name of HTML_ATTRIBUTES) {
    const value = parsed.documentElement.getAttribute(name);
    if (value === null) document.documentElement.removeAttribute(name);
    else document.documentElement.setAttribute(name, value);
  }
  document.title = "Cincel Workspace";
  document.head.querySelectorAll("style").forEach((node) => node.remove());
  parsed.head.querySelectorAll("style").forEach((node) => document.head.appendChild(document.importNode(node, true)));
  document.body.innerHTML = parsed.body.innerHTML;
}

async function seriousViolations() {
  const results = await axe.run(document, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

describe("root layout accessibility (flag on)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe.each(THEME_IDS)("theme %s", (theme) => {
    it.each(["light", "dark"] as const)("%s: no serious or critical axe violations", async (mode) => {
      await mountLayout(theme, mode);
      expect(document.documentElement.getAttribute("lang")).toBe("es");
      expect(document.documentElement.getAttribute("data-theme")).toBe(mode);
      expect(await seriousViolations()).toEqual([]);
    });

    it.each(["light", "dark"] as const)("%s: every token pair meets its contrast minimum", (mode) => {
      const results = checkContrast(THEME_PRESETS[theme].tokens, mode);
      expect(results).toHaveLength(CONTRAST_PAIRS.length);
      expect(results.filter((r) => !r.ok)).toEqual([]);
    });
  });
});
