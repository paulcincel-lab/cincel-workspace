import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  value: {
    status: "active",
    user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" },
  } as { status: string; user: { id: string; email: string | null; access: string } | null },
}));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: vi.fn(async () => session.value) }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/monday-import/service", () => ({ WizardError: class WizardError extends Error {} }));
vi.mock("@/lib/monday-import/wizard-writes", () => ({}));
vi.mock("@/scripts/monday/remap", () => ({}));
vi.mock("@/lib/repositories/onboarding-repository", () => ({}));

const history = vi.hoisted(() => ({ listMondayImportBatches: vi.fn() }));
vi.mock("@/lib/repositories/import-history-repository", () => history);

const bootstrap = vi.hoisted(() => ({ email: null as string | null }));
vi.mock("@/lib/onboarding/first-login", () => ({
  isBootstrapAdminEmail: (email: string | null | undefined) => Boolean(email && email === bootstrap.email),
}));

import { getMondayImportHistoryAction } from "./monday-import-actions";

const ROW = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "applied" as const,
  accountName: "Cincel",
  accountSlug: "cincel",
  appliedAt: new Date("2026-11-03T18:00:00Z"),
  rolledBackAt: null,
  appliedByName: "Alejandro Riofrio",
  mapping: { boards: [{}, {}] },
  stats: { created: { projects: 2, tasks: 10 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  bootstrap.email = null;
  session.value = { status: "active", user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" } };
  history.listMondayImportBatches.mockResolvedValue([ROW]);
});

describe("getMondayImportHistoryAction", () => {
  it("returns the batches as history entries for an Administrador", async () => {
    const result = await getMondayImportHistoryAction();
    expect(result).toEqual({
      ok: true,
      history: [
        expect.objectContaining({
          batchId: ROW.id,
          status: "applied",
          appliedAt: "2026-11-03T18:00:00.000Z",
          appliedBy: "Alejandro Riofrio",
          boards: 2,
          cards: 10,
          projects: 2,
        }),
      ],
    });
  });

  it("refuses anyone but an Administrador without reading", async () => {
    session.value = { status: "active", user: { id: "s", email: "s@cincel.mx", access: "Colaborador" } };
    const result = await getMondayImportHistoryAction();
    expect(result.ok).toBe(false);
    expect(history.listMondayImportBatches).not.toHaveBeenCalled();
  });

  it("refuses the bootstrap admin, like every monday action", async () => {
    bootstrap.email = "admin@cincel.mx";
    const result = await getMondayImportHistoryAction();
    expect(result.ok).toBe(false);
    expect(history.listMondayImportBatches).not.toHaveBeenCalled();
  });

  it("answers the generic error when the query fails", async () => {
    history.listMondayImportBatches.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await getMondayImportHistoryAction();
    expect(result).toEqual({ ok: false, error: "Algo salió mal. Intenta de nuevo." });
  });
});
