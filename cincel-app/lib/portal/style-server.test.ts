// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { serializePortalStyleCookie } from "@/lib/portal/style";
import { THEME_PRESETS } from "@/lib/ui/themes";

const state = vi.hoisted(() => ({
  cookieHeader: "" as string,
  stored: null as string | null,
  dbError: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      for (const part of state.cookieHeader.split(";")) {
        const [key, ...rest] = part.trim().split("=");
        if (key === name) return { name, value: rest.join("=") };
      }
      return undefined;
    },
  }),
}));
/** The shared, per-request cached `appearance.theme` read (root layout, portal appearance and style). */
const getStoredOrgAppearance = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ui/preferences-server", () => ({ getStoredOrgAppearance }));
/** The portal never queries `app_settings` on its own any more. */
const dbSelect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", () => ({ db: { select: dbSelect } }));

import { getPortalAppearance } from "@/lib/portal/appearance";
import { getPortalPresentation } from "@/lib/portal/style-server";

function store(overrides: Partial<typeof THEME_PRESETS.azul>) {
  state.stored = JSON.stringify({ ...THEME_PRESETS.azul, ...overrides, v: 2 });
}

describe("getPortalPresentation", () => {
  beforeEach(() => {
    state.cookieHeader = "";
    state.stored = null;
    state.dbError = false;
    dbSelect.mockReset();
    getStoredOrgAppearance.mockReset();
    // Like the real one: Azul defaults when the row is missing or the DB fails.
    getStoredOrgAppearance.mockImplementation(async () =>
      state.dbError || state.stored === null ? { ...THEME_PRESETS.azul, v: 1 } : JSON.parse(state.stored),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads back the style EstiloSwitch scope=\"portal\" wrote (cookie round trip)", async () => {
    store({ styleDefault: "visual", allowUserOverride: true });
    state.cookieHeader = `cincel_portal_session=t; ${serializePortalStyleCookie("analitico").split(";")[0]}`;

    expect(await getPortalPresentation()).toEqual({ style: "analitico", fixedByOrg: false });
  });

  it("an invalid cookie falls back to the organization default style", async () => {
    store({ styleDefault: "esencial", allowUserOverride: true });
    state.cookieHeader = "cincel-portal-style=oscuro";

    expect((await getPortalPresentation()).style).toBe("esencial");
  });

  it("no cookie: organization default", async () => {
    store({ styleDefault: "analitico" });

    expect((await getPortalPresentation()).style).toBe("analitico");
  });

  it("organization fixed the style: the cookie is ignored", async () => {
    store({ styleDefault: "visual", allowUserOverride: false });
    state.cookieHeader = "cincel-portal-style=esencial";

    expect(await getPortalPresentation()).toEqual({ style: "visual", fixedByOrg: true });
  });

  it("DB errors fall back to the Azul defaults", async () => {
    state.dbError = true;
    state.cookieHeader = "cincel-portal-style=esencial";

    expect((await getPortalPresentation()).style).toBe("esencial");
    expect((await getPortalPresentation()).fixedByOrg).toBe(!THEME_PRESETS.azul.allowUserOverride);
  });

  it("reads appearance.theme only through the shared cached read, never on its own", async () => {
    store({ styleDefault: "esencial", allowUserOverride: true });

    await Promise.all([getPortalPresentation(), getPortalAppearance()]);

    expect(dbSelect).not.toHaveBeenCalled();
    expect(getStoredOrgAppearance).toHaveBeenCalled();
  });
});
