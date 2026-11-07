// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { serializePortalStyleCookie } from "@/lib/portal/style";
import { THEME_PRESETS } from "@/lib/ui/themes";

const state = vi.hoisted(() => ({
  cookieHeader: "" as string,
  stored: null as string | null,
  dbError: false,
  redesignEnabled: true,
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
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (state.dbError) throw new Error("db down");
            return state.stored === null ? [] : [{ value: state.stored }];
          },
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/portal/appearance", () => ({
  getPortalAppearance: async () => ({ redesignEnabled: state.redesignEnabled }),
}));

import { getPortalPresentation } from "@/lib/portal/style-server";

function store(overrides: Partial<typeof THEME_PRESETS.azul>) {
  state.stored = JSON.stringify({ version: 1, data: { ...THEME_PRESETS.azul, ...overrides, v: 2 } });
}

describe("getPortalPresentation", () => {
  beforeEach(() => {
    state.cookieHeader = "";
    state.stored = null;
    state.dbError = false;
    state.redesignEnabled = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads back the style EstiloSwitch scope=\"portal\" wrote (cookie round trip)", async () => {
    store({ styleDefault: "visual", allowUserOverride: true });
    state.cookieHeader = `cincel_portal_session=t; ${serializePortalStyleCookie("analitico").split(";")[0]}`;

    expect(await getPortalPresentation()).toEqual({ redesignEnabled: true, style: "analitico", fixedByOrg: false });
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

    expect(await getPortalPresentation()).toEqual({ redesignEnabled: true, style: "visual", fixedByOrg: true });
  });

  it("follows the organization flag", async () => {
    state.redesignEnabled = false;

    expect((await getPortalPresentation()).redesignEnabled).toBe(false);
  });

  it("DB errors fall back to the Azul defaults", async () => {
    state.dbError = true;
    state.cookieHeader = "cincel-portal-style=esencial";

    expect((await getPortalPresentation()).style).toBe("esencial");
    expect((await getPortalPresentation()).fixedByOrg).toBe(!THEME_PRESETS.azul.allowUserOverride);
  });
});
