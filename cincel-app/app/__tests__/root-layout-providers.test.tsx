// @vitest-environment happy-dom
/**
 * Provider order in the root layout (#935, plan §4.6): `QueryProvider` wraps
 * the `AppearanceStoreProvider` (#954, seeded with the server-resolved
 * appearance, and so every page) and the one `<Toaster>`, so both can use the
 * query cache.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { appearanceFor, appearanceState } from "./root-layout-mocks";

vi.mock("next/font/google", async () => (await import("./root-layout-mocks")).fontMock);
vi.mock("@/components/auth/AppRouteGuard", async () => (await import("./root-layout-mocks")).passthroughDefaultMock);
vi.mock("@/components/auth/SessionHydrator", async () => (await import("./root-layout-mocks")).hydratorMock);
vi.mock("@/components/providers/QueryProvider", () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="query-provider">{children}</div>,
}));
vi.mock("@/lib/stores/appearance-store", () => ({
  AppearanceStoreProvider: ({ initial, children }: { initial: { theme: string; mode: string }; children: ReactNode }) => (
    <div data-testid="appearance-provider" data-seed={`${initial.theme}/${initial.mode}`}>
      {children}
    </div>
  ),
}));
vi.mock("@/lib/auth/session", async () => (await import("./root-layout-mocks")).sessionMock);
vi.mock("@/lib/settings/general-settings", async () => (await import("./root-layout-mocks")).generalSettingsMock);
vi.mock("@/lib/settings/general-settings-server", async () => (await import("./root-layout-mocks")).generalSettingsServerMock);
vi.mock("@/lib/settings/use-general-settings", async () => (await import("./root-layout-mocks")).useGeneralSettingsMock);
vi.mock("@/lib/ui/preferences-server", async () => (await import("./root-layout-mocks")).preferencesServerMock);
vi.mock("@/lib/actions/preferences-actions", async () => (await import("./root-layout-mocks")).preferencesActionsMock);
vi.mock("@/components/ui/shadcn/sonner", async () => (await import("./root-layout-mocks")).toasterMock);
vi.mock("../globals.css", async () => (await import("./root-layout-mocks")).cssMock);

describe("root layout providers", () => {
  it("QueryProvider wraps the AppearanceStoreProvider (with the page) and the Toaster", async () => {
    appearanceState.value = appearanceFor("azul", { mode: "light" });
    const { default: RootLayout } = await import("../layout");
    const markup = renderToStaticMarkup(await RootLayout({ children: <main id="page">Inicio</main> }));
    const doc = new DOMParser().parseFromString(`<!doctype html>${markup}`, "text/html");

    const query = doc.querySelectorAll('[data-testid="query-provider"]');
    expect(query).toHaveLength(1);
    expect(query[0].parentElement?.tagName).toBe("BODY");
    expect(query[0].querySelector('[data-testid="appearance-provider"] #page')).not.toBeNull();
    // Seeded with the server-resolved appearance.
    expect(query[0].querySelector('[data-testid="appearance-provider"]')?.getAttribute("data-seed")).toBe("azul/light");
    expect(query[0].querySelector('[data-testid="toaster"]')).not.toBeNull();
    expect(doc.querySelectorAll('[data-testid="toaster"]')).toHaveLength(1);
  });
});
