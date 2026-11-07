import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const mocks = vi.hoisted(() => ({
  requirePageCapability: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  // Only Next's own control-flow errors are rethrown; plain errors fall through to notFound().
  unstable_rethrow: (err: unknown) => {
    if (err instanceof Error && err.message.startsWith("NEXT_")) throw err;
  },
}));
vi.mock("@/lib/auth/session", () => ({ requirePageCapability: mocks.requirePageCapability }));

import { canManageGeneralSettings } from "@/lib/auth/permissions";
import AjustesGeneralLayout from "./layout";

function viewer(access: string): AuthenticatedUser {
  return {
    member: {
      id: `staff-${access}`,
      name: access,
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access,
  } as AuthenticatedUser;
}

/** The real guard contract: the capability decides, a failing check is a 404. */
function guardAs(user: AuthenticatedUser) {
  mocks.requirePageCapability.mockImplementation(async (cap: (u: AuthenticatedUser) => boolean) => {
    if (!cap(user)) mocks.notFound();
    return user;
  });
}

beforeEach(() => {
  mocks.requirePageCapability.mockReset();
  mocks.notFound.mockClear();
});

describe("/ajustes/general segment guard", () => {
  it("checks canManageGeneralSettings and renders the page for an administrator", async () => {
    guardAs(viewer("Administrador"));
    const out = await AjustesGeneralLayout({ children: "contenido" });
    expect(mocks.requirePageCapability).toHaveBeenCalledWith(canManageGeneralSettings);
    expect(out).toBe("contenido");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("returns 404 for a viewer without canManageGeneralSettings", async () => {
    guardAs(viewer("Jefe de Taller"));
    await expect(AjustesGeneralLayout({ children: "contenido" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("returns 404 when the guard fails with a plain error", async () => {
    mocks.requirePageCapability.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(AjustesGeneralLayout({ children: "contenido" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("keeps Next's own redirects (no session → /login)", async () => {
    mocks.requirePageCapability.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(AjustesGeneralLayout({ children: "contenido" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
