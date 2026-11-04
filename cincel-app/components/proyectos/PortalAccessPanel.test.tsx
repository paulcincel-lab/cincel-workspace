import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/portal-actions", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import type { PortalAccessRow, PortalAccessStatus } from "@/lib/types/portal";

import { portalRowActions } from "./PortalAccessPanel";

function row(status: PortalAccessStatus): PortalAccessRow {
  return {
    accessId: "a1",
    portalUserId: "u1",
    name: "Ana Ruiz",
    email: "ana@example.test",
    contact: { id: "c1", name: "Familia Ruiz", type: "cliente" },
    status,
    invitedBy: "Oscar",
    lastLoginAt: null,
  };
}

const handlers = { resend: vi.fn(), revoke: vi.fn(), disable: vi.fn(), enable: vi.fn() };
const admin = { manageAccess: true, disableUsers: true };
const manager = { manageAccess: true, disableUsers: false };

const labels = (status: PortalAccessStatus, caps = admin) =>
  portalRowActions(row(status), caps, handlers).map((action) => action.label);

describe("portalRowActions", () => {
  it("offers resend, revoke and disable on an active or invited row", () => {
    expect(labels("active")).toEqual(["Reenviar invitación", "Quitar acceso", "Deshabilitar"]);
    expect(labels("invited")).toEqual(["Reenviar invitación", "Quitar acceso", "Deshabilitar"]);
  });

  it("shows Habilitar instead of Deshabilitar on a disabled row", () => {
    expect(labels("disabled")).toEqual(["Habilitar", "Quitar acceso"]);
  });

  it("hides Deshabilitar and Habilitar without portal.disableUsers", () => {
    expect(labels("active", manager)).toEqual(["Reenviar invitación", "Quitar acceso"]);
    expect(labels("disabled", manager)).toEqual(["Quitar acceso"]);
  });

  it("has no actions on a revoked row", () => {
    expect(labels("revoked")).toEqual([]);
  });

  it("marks the destructive actions", () => {
    const actions = portalRowActions(row("active"), admin, handlers);
    expect(actions.filter((a) => a.variant === "destructive").map((a) => a.label)).toEqual([
      "Quitar acceso",
      "Deshabilitar",
    ]);
  });
});
