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
  unstable_rethrow: (err: unknown) => {
    if (err instanceof Error && err.message.startsWith("NEXT_")) throw err;
  },
}));
vi.mock("@/lib/auth/session", () => ({ requirePageCapability: mocks.requirePageCapability }));

import AjustesMenuLayout from "./layout";

function viewer(access: string): AuthenticatedUser {
  return { member: { id: access, name: access, role: access }, email: "", access } as unknown as AuthenticatedUser;
}

function guardAs(user: AuthenticatedUser) {
  mocks.requirePageCapability.mockImplementation(async (cap: (u: AuthenticatedUser) => boolean) => {
    if (!cap(user)) mocks.notFound();
    return user;
  });
}

beforeEach(() => vi.clearAllMocks());

describe("/ajustes/menu layout", () => {
  it("renders for an administrator", async () => {
    guardAs(viewer("Administrador"));
    await expect(AjustesMenuLayout({ children: "ok" })).resolves.toBe("ok");
  });

  it("is a 404 for anyone else", async () => {
    guardAs(viewer("Colaborador"));
    await expect(AjustesMenuLayout({ children: "ok" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
