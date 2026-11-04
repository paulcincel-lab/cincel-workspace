import { beforeEach, describe, expect, it, vi } from "vitest";

const RUN = "12345678-1234-4234-8234-123456789012";
const TOKEN = "secret-token-xyz";

const session = vi.hoisted(() => ({
  value: {
    status: "active",
    user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" },
  } as { status: string; user: { id: string; email: string | null; access: string } | null },
}));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: vi.fn(async () => session.value) }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
const onboarding = vi.hoisted(() => ({
  hasAppliedImport: vi.fn(async () => false),
  markOnboardingCompleted: vi.fn(async () => {}),
}));
vi.mock("@/lib/repositories/onboarding-repository", () => onboarding);

const service = vi.hoisted(() => {
  class WizardError extends Error {}
  return {
    WizardError,
    connectMonday: vi.fn(),
    startExport: vi.fn(),
    startApply: vi.fn(),
    previewImport: vi.fn(),
    getRunState: vi.fn(),
    isStep: (s: unknown) => s === "equivalencias",
  };
});
vi.mock("@/lib/monday-import/service", () => service);

import {
  connectMondayAction,
  getMondayImportRunAction,
  startMondayApplyAction,
  startMondayExportAction,
} from "./monday-import-actions";

beforeEach(() => {
  vi.clearAllMocks();
  session.value = { status: "active", user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" } };
  vi.stubEnv("BOOTSTRAP_ADMIN_EMAIL", "boot@cincel.mx");
});

describe("monday import actions", () => {
  it("refuses anyone but an Administrador", async () => {
    session.value = { status: "active", user: { id: "u", email: "u@cincel.mx", access: "Colaborador" } };
    await expect(connectMondayAction(TOKEN)).resolves.toEqual({
      ok: false,
      error: "Solo un Administrador puede importar de monday.",
    });
    expect(service.connectMonday).not.toHaveBeenCalled();
  });

  it("refuses the bootstrap admin, who only gets the Google wizard", async () => {
    session.value = { status: "active", user: { id: "b", email: "Boot@cincel.mx", access: "Administrador" } };
    expect((await startMondayApplyAction(RUN)).ok).toBe(false);
    expect(service.startApply).not.toHaveBeenCalled();
  });

  it("shows a WizardError inline and hides anything else behind a generic message", async () => {
    service.connectMonday.mockRejectedValueOnce(new service.WizardError("monday rechazó el token."));
    await expect(connectMondayAction(TOKEN)).resolves.toEqual({ ok: false, error: "monday rechazó el token." });

    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    service.connectMonday.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(connectMondayAction(TOKEN)).resolves.toEqual({ ok: false, error: "Algo salió mal. Intenta de nuevo." });
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    log.mockRestore();
  });

  it("rejects anything but a run id", async () => {
    expect(await getMondayImportRunAction("../../etc")).toEqual({ ok: false, error: "No se encontró esta importación." });
    expect(service.getRunState).not.toHaveBeenCalled();
  });

  it("passes the token to the export once and applies as the signed-in admin", async () => {
    service.startExport.mockResolvedValueOnce({ status: "running" });
    await startMondayExportAction(RUN, TOKEN, { boardIds: ["101"], files: false });
    expect(service.startExport).toHaveBeenCalledWith(
      RUN,
      TOKEN,
      { boardIds: ["101"], updates: true, files: false },
      expect.anything(),
    );

    service.startApply.mockResolvedValueOnce({ status: "running" });
    expect(await startMondayApplyAction(RUN)).toEqual({ ok: true, job: { status: "running" } });
    expect(service.startApply).toHaveBeenCalledWith(
      RUN,
      { email: "admin@cincel.mx" },
      expect.anything(),
      expect.any(Function),
    );
  });

  it("marks the admin's first-login wizard as finished once the import is applied", async () => {
    service.startApply.mockResolvedValueOnce({ status: "running" });
    await startMondayApplyAction(RUN);
    expect(onboarding.markOnboardingCompleted).not.toHaveBeenCalled();
    const onApplied = service.startApply.mock.calls[0][3] as () => Promise<void>;
    await onApplied();
    expect(onboarding.markOnboardingCompleted).toHaveBeenCalledWith("admin");
  });
});
