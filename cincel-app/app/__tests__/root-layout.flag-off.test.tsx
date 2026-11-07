// @vitest-environment happy-dom
/**
 * Root layout with `ui.redesign` off (review B17): exactly today's pipeline —
 * the `primary-color` block and `globals.css` — and none of the appearance
 * block, `<html>` appearance attributes or system-mode head script.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { primaryColorCss } from "@/lib/theme/primary-color";
import { appearanceFor, appearanceState, preferencesActionsMock, primaryColorState } from "./root-layout-mocks";

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

async function renderLayout(): Promise<{ markup: string; doc: Document }> {
  const { default: RootLayout } = await import("../layout");
  const markup = renderToStaticMarkup(
    await RootLayout({
      children: (
        <main>
          <h1>Tablero</h1>
        </main>
      ),
    }),
  );
  return { markup, doc: new DOMParser().parseFromString(`<!doctype html>${markup}`, "text/html") };
}

const APPEARANCE_ATTRIBUTES = ["data-theme", "data-theme-id", "data-style", "data-density", "data-mode"];

describe("root layout, redesign flag off (B17)", () => {
  beforeEach(() => {
    primaryColorState.value = null;
    appearanceState.value = appearanceFor("azul", { redesignEnabled: false, mode: "dark" });
  });

  it("renders today's <html>: Spanish, the Geist font variables, no appearance attributes", async () => {
    const { doc } = await renderLayout();
    const html = doc.documentElement;
    expect(html.getAttribute("lang")).toBe("es");
    expect(html.getAttribute("class")).toBe("font--font-geist-sans font--font-geist-mono h-full antialiased");
    for (const attribute of APPEARANCE_ATTRIBUTES) expect(html.hasAttribute(attribute)).toBe(false);
    expect(html.hasAttribute("style")).toBe(false);
    expect(html.classList.contains("dark")).toBe(false);
  });

  it("emits no appearance block, base rules or head script", async () => {
    const { doc, markup } = await renderLayout();
    expect(doc.getElementById("appearance")).toBeNull();
    expect(doc.getElementById("appearance-base")).toBeNull();
    expect(doc.getElementById("appearance-mode")).toBeNull();
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(markup).not.toContain("html:root[data-theme=");
  });

  it("keeps the primary-color block when the org picked a color", async () => {
    primaryColorState.value = "blue-700";
    const { doc } = await renderLayout();
    const block = doc.getElementById("primary-color");
    expect(block).not.toBeNull();
    expect(block?.textContent).toBe(primaryColorCss("blue-700"));
  });

  it("renders no primary-color block for the default color", async () => {
    const { doc } = await renderLayout();
    expect(doc.getElementById("primary-color")).toBeNull();
  });

  it("stays on the legacy pipeline when the org kill switch is off even if the user opted in", async () => {
    const resolved = appearanceFor("azul", { redesignEnabled: true });
    appearanceState.value = { ...resolved, redesignEnabled: false };
    const { doc } = await renderLayout();
    expect(doc.getElementById("appearance")).toBeNull();
    expect(doc.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("mounts exactly one Toaster, bottom-right with a 72 px offset", async () => {
    const { doc } = await renderLayout();
    const toasters = doc.querySelectorAll('[data-testid="toaster"]');
    expect(toasters).toHaveLength(1);
    expect(toasters[0].getAttribute("data-position")).toBe("bottom-right");
    expect(toasters[0].getAttribute("data-offset")).toBe("72");
  });

  it("renders the page and calls no write action", async () => {
    const { doc } = await renderLayout();
    expect(doc.querySelector("main h1")?.textContent).toBe("Tablero");
    expect(preferencesActionsMock.updateMyPreferencesAction).not.toHaveBeenCalled();
  });
});
