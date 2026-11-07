import { afterEach, describe, expect, it, vi } from "vitest";

import type { NavSession } from "@/lib/ui/nav";

const SESSION: NavSession = { staffId: "s-1", name: "Ana López", role: "Arquitecta", isAdmin: false, photoUrl: null };

async function loadWith(implemented: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/actions/dashboard-actions.flags", () => ({ IMPLEMENTED: { fetchInicioAction: implemented } }));
  return (await import("./inicio")).inicioNavItem;
}

afterEach(() => {
  vi.doUnmock("@/lib/actions/dashboard-actions.flags");
  vi.resetModules();
});

describe("inicio nav item", () => {
  it("is the first item of the main section", async () => {
    const item = await loadWith(true);
    expect(item.key).toBe("inicio");
    expect(item.section).toBe("items");
    expect(item.order).toBe(10);
  });

  it("links /inicio once fetchInicioAction is implemented", async () => {
    const item = await loadWith(true);
    const resolved = await item.resolve(SESSION);
    expect(resolved).toMatchObject({ key: "inicio", label: "Inicio", href: "/inicio" });
    expect(resolved?.icon).toBeTruthy();
    expect(resolved?.badge).toBeUndefined();
  });

  it("stays hidden while fetchInicioAction is a stub", async () => {
    const item = await loadWith(false);
    expect(await item.resolve(SESSION)).toBeNull();
  });
});
