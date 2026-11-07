import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { canManageAppearance } from "@/lib/auth/permissions";
import AjustesTemaLayout from "./layout";

beforeEach(() => {
  mocks.requirePageCapability.mockReset();
  mocks.notFound.mockClear();
});

describe("/ajustes/tema segment guard", () => {
  it("checks canManageAppearance and renders the page for an admin", async () => {
    mocks.requirePageCapability.mockResolvedValue({ id: "admin" });
    const out = await AjustesTemaLayout({ children: "contenido" });
    expect(mocks.requirePageCapability).toHaveBeenCalledWith(canManageAppearance);
    expect(out).toBe("contenido");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("returns 404 for a viewer without the capability", async () => {
    mocks.requirePageCapability.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(AjustesTemaLayout({ children: "contenido" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("keeps Next's own redirects (no session → /login)", async () => {
    mocks.requirePageCapability.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(AjustesTemaLayout({ children: "contenido" })).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
