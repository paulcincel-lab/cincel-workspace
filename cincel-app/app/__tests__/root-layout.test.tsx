// @vitest-environment happy-dom
/**
 * Root layout (FE §4.1, BE §8.2, reviews B2, B18):
 * `<html>` appearance attributes with `data-theme` always set, `.dark` in
 * sync, one `<style id="appearance">` with `html:root[data-theme=…]`
 * sections, the system-mode head script (≤ 1 KB) only in system mode, and no
 * token in a `style` attribute.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ColorMode, ThemeId } from "@/lib/types/redesign";
import { appearanceStyleBlock, SYSTEM_MODE_SCRIPT } from "@/lib/ui/appearance-css";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import { appearanceFor, appearanceState, preferencesActionsMock } from "./root-layout-mocks";

vi.mock("next/font/google", async () => (await import("./root-layout-mocks")).fontMock);
vi.mock("@/components/auth/AppRouteGuard", async () => (await import("./root-layout-mocks")).passthroughDefaultMock);
vi.mock("@/components/auth/SessionHydrator", async () => (await import("./root-layout-mocks")).hydratorMock);
vi.mock("@/components/providers/QueryProvider", async () => (await import("./root-layout-mocks")).passthroughDefaultMock);
vi.mock("@/lib/auth/session-context", async () => (await import("./root-layout-mocks")).sessionContextMock);
vi.mock("@/lib/auth/session", async () => (await import("./root-layout-mocks")).sessionMock);
vi.mock("@/lib/settings/general-settings", async () => (await import("./root-layout-mocks")).generalSettingsMock);
vi.mock("@/lib/settings/general-settings-server", async () => (await import("./root-layout-mocks")).generalSettingsServerMock);
vi.mock("@/lib/settings/use-general-settings", async () => (await import("./root-layout-mocks")).useGeneralSettingsMock);
vi.mock("@/lib/ui/preferences-server", async () => (await import("./root-layout-mocks")).preferencesServerMock);
vi.mock("@/lib/actions/preferences-actions", async () => (await import("./root-layout-mocks")).preferencesActionsMock);
vi.mock("@/components/ui/shadcn/sonner", async () => (await import("./root-layout-mocks")).toasterMock);
vi.mock("../globals.css", async () => (await import("./root-layout-mocks")).cssMock);

async function renderLayout(theme: ThemeId, mode: ColorMode): Promise<{ markup: string; doc: Document }> {
  appearanceState.value = appearanceFor(theme, { mode, density: "compacta", textSize: 15 });
  const { default: RootLayout } = await import("../layout");
  const markup = renderToStaticMarkup(
    await RootLayout({
      children: (
        <main>
          <h1>Inicio</h1>
        </main>
      ),
    }),
  );
  return { markup, doc: new DOMParser().parseFromString(`<!doctype html>${markup}`, "text/html") };
}

describe("root layout", () => {
  describe.each(THEME_IDS)("theme %s", (theme) => {
    it("light: data-theme light, no .dark, appearance attributes, no head script", async () => {
      const { doc } = await renderLayout(theme, "light");
      const html = doc.documentElement;
      expect(html.getAttribute("lang")).toBe("es");
      expect(html.getAttribute("data-theme")).toBe("light");
      expect(html.getAttribute("data-mode")).toBe("light");
      expect(html.getAttribute("data-theme-id")).toBe(theme);
      expect(html.getAttribute("data-style")).toBe("visual");
      expect(html.getAttribute("data-density")).toBe("compacta");
      expect(html.classList.contains("dark")).toBe(false);
      expect(html.classList.contains("text-size-15")).toBe(true);
      expect(doc.getElementById("appearance-mode")).toBeNull();
    });

    it("dark: data-theme dark and .dark together", async () => {
      const { doc } = await renderLayout(theme, "dark");
      const html = doc.documentElement;
      expect(html.getAttribute("data-theme")).toBe("dark");
      expect(html.classList.contains("dark")).toBe(true);
      expect(doc.getElementById("appearance-mode")).toBeNull();
    });

    it("system: data-theme still present, and the head script is rendered", async () => {
      const { doc } = await renderLayout(theme, "system");
      const html = doc.documentElement;
      expect(html.getAttribute("data-theme")).toMatch(/^(light|dark)$/);
      expect(html.getAttribute("data-mode")).toBe("system");
      const script = doc.querySelector("head script#appearance-mode");
      expect(script?.textContent).toBe(SYSTEM_MODE_SCRIPT);
    });

    it("renders one appearance block with both html:root[data-theme] sections of the theme's tokens", async () => {
      const { doc } = await renderLayout(theme, "light");
      const blocks = doc.querySelectorAll("style#appearance");
      expect(blocks).toHaveLength(1);
      const css = blocks[0].textContent ?? "";
      expect(css).toBe(appearanceStyleBlock(appearanceState.value!.cssVars));
      expect(css).toContain(`html:root[data-theme="light"]{`);
      expect(css).toContain(`html:root[data-theme="dark"]{`);
      const tokens = THEME_PRESETS[theme].tokens;
      expect(css).toContain(`--background:${tokens.background.light}`);
      expect(css).toContain(`--background:${tokens.background.dark}`);
      expect(blocks[0].parentElement?.tagName).toBe("HEAD");
    });

    it("never puts a token in a style attribute", async () => {
      for (const mode of ["light", "dark", "system"] as const) {
        const { doc } = await renderLayout(theme, mode);
        expect(doc.documentElement.hasAttribute("style")).toBe(false);
        for (const element of Array.from(doc.querySelectorAll("[style]"))) {
          expect(element.getAttribute("style")).not.toMatch(/--[a-z]/);
        }
      }
    });
  });

  it("declares every selectable font variable on <html>", async () => {
    const { doc } = await renderLayout("azul", "light");
    const classes = doc.documentElement.classList;
    for (const variable of ["--font-geist-sans", "--font-geist-mono", "--font-inter", "--font-dm-sans"]) {
      expect(classes.contains(`font${variable}`)).toBe(true);
    }
  });

  it("renders the base rules for the text-size classes and the font family", async () => {
    const { doc } = await renderLayout("azul", "light");
    const css = doc.getElementById("appearance-base")?.textContent ?? "";
    expect(css).toContain("html:root[data-theme].text-size-15{--text-base:15px}");
    expect(css).toContain("html:root[data-theme].text-size-13-5{--text-base:13.5px}");
    expect(css).toContain("font-family:var(--font-sans");
  });

  it("mounts exactly one Toaster, bottom-right with a 72 px offset", async () => {
    const { doc } = await renderLayout("calido", "dark");
    const toasters = doc.querySelectorAll('[data-testid="toaster"]');
    expect(toasters).toHaveLength(1);
    expect(toasters[0].getAttribute("data-position")).toBe("bottom-right");
    expect(toasters[0].getAttribute("data-offset")).toBe("72");
  });

  it("calls no write action while rendering", async () => {
    await renderLayout("grafito", "system");
    expect(preferencesActionsMock.updateMyPreferencesAction).not.toHaveBeenCalled();
  });
});

describe("SYSTEM_MODE_SCRIPT", () => {
  const root = document.documentElement;
  let listeners: Array<() => void> = [];
  let matches = false;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    listeners = [];
    matches = false;
    root.removeAttribute("data-theme");
    root.classList.remove("dark");
    root.setAttribute("data-mode", "system");
    window.matchMedia = ((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    root.removeAttribute("data-mode");
  });

  it("is at most 1 KB", () => {
    expect(new TextEncoder().encode(SYSTEM_MODE_SCRIPT).length).toBeLessThanOrEqual(1024);
  });

  it("sets data-theme and .dark from the OS before paint and follows changes", () => {
    matches = true;
    new Function(SYSTEM_MODE_SCRIPT)();
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(root.classList.contains("dark")).toBe(true);

    matches = false;
    for (const listener of listeners) listener();
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("does nothing once the mode is explicit", () => {
    new Function(SYSTEM_MODE_SCRIPT)();
    root.setAttribute("data-mode", "light");
    root.setAttribute("data-theme", "light");
    matches = true;
    for (const listener of listeners) listener();
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(root.classList.contains("dark")).toBe(false);
  });
});
