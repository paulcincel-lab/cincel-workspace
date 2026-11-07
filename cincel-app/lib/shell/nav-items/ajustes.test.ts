import { afterEach, describe, expect, it, vi } from "vitest";

import type { NavSession } from "@/lib/ui/nav";

const SESSION: NavSession = { staffId: "s-1", name: "Ana López", role: "Arquitecta", isAdmin: false, photoUrl: null };

async function loadWith(flags: { fetchMyPreferencesAction: boolean; updateMyPreferencesAction: boolean }) {
  vi.resetModules();
  vi.doMock("@/lib/actions/preferences-actions.flags", () => ({ IMPLEMENTED: flags }));
  return (await import("./ajustes")).ajustesNavItem;
}

afterEach(() => {
  vi.doUnmock("@/lib/actions/preferences-actions.flags");
  vi.resetModules();
});

describe("ajustes nav item", () => {
  it("is the first item of the footer", async () => {
    const item = await loadWith({ fetchMyPreferencesAction: true, updateMyPreferencesAction: true });
    expect(item.key).toBe("ajustes");
    expect(item.section).toBe("footer");
    expect(item.order).toBe(10);
  });

  it("links /ajustes for every staff member once the preferences actions are implemented", async () => {
    const item = await loadWith({ fetchMyPreferencesAction: true, updateMyPreferencesAction: true });
    for (const isAdmin of [false, true]) {
      const resolved = await item.resolve({ ...SESSION, isAdmin });
      expect(resolved).toMatchObject({ key: "ajustes", label: "Ajustes", href: "/ajustes" });
      expect(resolved?.icon).toBeTruthy();
      expect(resolved?.badge).toBeUndefined();
    }
  });

  it("stays hidden while either preferences action is a stub", async () => {
    for (const flags of [
      { fetchMyPreferencesAction: false, updateMyPreferencesAction: false },
      { fetchMyPreferencesAction: true, updateMyPreferencesAction: false },
      { fetchMyPreferencesAction: false, updateMyPreferencesAction: true },
    ]) {
      const item = await loadWith(flags);
      expect(await item.resolve(SESSION)).toBeNull();
    }
  });
});
