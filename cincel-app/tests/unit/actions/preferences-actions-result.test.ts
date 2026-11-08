import { beforeEach, describe, expect, it, vi } from "vitest";

const org = vi.hoisted(() => ({ allowUserOverride: true }));
const prefs = vi.hoisted(() => ({
  upsertUserPreferences: vi.fn(async () => ({ staffId: "staff-1", mode: "dark" })),
  findUserPreferences: vi.fn(async () => null),
}));
const server = vi.hoisted(() => ({
  getStoredOrgAppearance: vi.fn(async () => org),
  rowToResolverInput: vi.fn(() => null),
  rowToUserPreferences: vi.fn(() => ({ mode: "dark" })),
  writeAppearanceCookie: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: "staff-1" }, access: "Colaborador" })),
}));
vi.mock("@/lib/db/client", () => ({ db: { marker: "db" } }));
vi.mock("@/lib/repositories/preferences-repository", () => prefs);
vi.mock("@/lib/ui/preferences-server", () => server);
vi.mock("@/lib/ui/preferences", () => ({ resolveAppearance: vi.fn(() => ({ mode: "dark" })) }));

import { updateMyPreferencesAction } from "@/lib/actions/preferences-actions";

beforeEach(() => {
  vi.clearAllMocks();
  org.allowUserOverride = true;
});

describe("updateMyPreferencesAction (ActionResult)", () => {
  it("returns { ok: true, data } with the preferences and the resolved appearance", async () => {
    await expect(updateMyPreferencesAction({ mode: "dark" })).resolves.toEqual({
      ok: true,
      data: { preferences: { mode: "dark" }, appearance: { mode: "dark" } },
    });
    expect(server.writeAppearanceCookie).toHaveBeenCalledWith({ mode: "dark" });
  });

  it("returns OVERRIDE_DISABLED instead of throwing while the org fixed the theme", async () => {
    org.allowUserOverride = false;
    await expect(updateMyPreferencesAction({ theme: "calido" })).resolves.toEqual({
      ok: false,
      error: "OVERRIDE_DISABLED",
    });
    expect(prefs.upsertUserPreferences).not.toHaveBeenCalled();
    expect(server.writeAppearanceCookie).not.toHaveBeenCalled();
  });

  it("returns INVALID for an unknown field", async () => {
    const result = await updateMyPreferencesAction({ nope: true } as never);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/^INVALID/) });
  });
});
