import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ canViewCalendar: true }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1" }, access: "Colaborador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveCalendarCapabilities: () => ({ canViewCalendar: state.canViewCalendar }),
}));

import { calendarioNavItem } from "./calendario";

const SESSION = { staffId: "s1", name: "Ana", role: "Colaborador", isAdmin: false, photoUrl: null };

beforeEach(() => {
  state.canViewCalendar = true;
});

describe("calendarioNavItem", () => {
  it("sits after Tareas (30) in the main section", () => {
    expect(calendarioNavItem.key).toBe("calendario");
    expect(calendarioNavItem.section).toBe("items");
    expect(calendarioNavItem.order).toBe(35);
  });

  it("returns the item when the viewer can view the calendar", async () => {
    expect(await calendarioNavItem.resolve(SESSION)).toMatchObject({ key: "calendario", label: "Calendario", href: "/calendario" });
  });

  it("is absent without the calendar view capability", async () => {
    state.canViewCalendar = false;
    expect(await calendarioNavItem.resolve(SESSION)).toBeNull();
  });
});
