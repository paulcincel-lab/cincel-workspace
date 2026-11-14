import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ can: true, enabled: true, nuevo: 3, fails: false }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1" }, access: "Administrador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({ canManageSupport: () => state.can }));
vi.mock("@/lib/soporte/flags", () => ({
  get MEJORAS_ENABLED() {
    return state.enabled;
  },
}));
vi.mock("@/lib/actions/mejoras-actions", () => ({
  mejorasCountsAction: async () => {
    if (state.fails) throw new Error("boom");
    return { byStatus: {}, nuevo: state.nuevo, total: 10 };
  },
}));

import { mejorasNavItem } from "./mejoras";

const SESSION = { staffId: "s1", name: "Ana", role: "Administrador", isAdmin: true, photoUrl: null };

beforeEach(() => {
  state.can = true;
  state.enabled = true;
  state.nuevo = 3;
  state.fails = false;
});

describe("mejorasNavItem", () => {
  it("sits after Asistente in the main section", () => {
    expect(mejorasNavItem.key).toBe("mejoras");
    expect(mejorasNavItem.section).toBe("items");
    expect(mejorasNavItem.order).toBe(75);
  });

  it("returns the item with the count of nuevo as its badge", async () => {
    expect(await mejorasNavItem.resolve(SESSION)).toMatchObject({ key: "mejoras", label: "Mejoras", href: "/mejoras", badge: 3 });
  });

  it("is absent without canManageSupport", async () => {
    state.can = false;
    expect(await mejorasNavItem.resolve(SESSION)).toBeNull();
  });

  it("is absent while the flag is off", async () => {
    state.enabled = false;
    expect(await mejorasNavItem.resolve(SESSION)).toBeNull();
  });

  it("still shows when the count fails", async () => {
    state.fails = true;
    expect(await mejorasNavItem.resolve(SESSION)).toMatchObject({ key: "mejoras", badge: 0 });
  });
});
