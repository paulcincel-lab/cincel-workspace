import { beforeEach, describe, expect, it, vi } from "vitest";

const RUN = "12345678-1234-4234-8234-123456789012";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const STATUS = "33333333-3333-4333-8333-333333333333";
const POSITION = "44444444-4444-4444-8444-444444444444";
const ETAPA = "55555555-5555-4555-8555-555555555555";
const TOKEN = "secret-token-xyz";

const session = vi.hoisted(() => ({
  value: {
    status: "active",
    user: { id: "admin", email: "admin@cincel.mx", access: "Administrador" },
  } as { status: string; user: { id: string; email: string | null; access: string } | null },
}));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: vi.fn(async () => session.value) }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
    getExportSource: vi.fn(),
    getImportChoices: vi.fn(),
    recordCreatedStaff: vi.fn(async () => {}),
    saveStatusMap: vi.fn(async () => {}),
    suggestPosition: vi.fn(),
    isStep: (s: unknown) => s === "equivalencias",
  };
});
vi.mock("@/lib/monday-import/service", () => service);

const writes = vi.hoisted(() => ({
  statusMapStatusesExist: vi.fn(async () => true),
  createStaffWithPositions: vi.fn(),
}));
vi.mock("@/lib/monday-import/wizard-writes", () => writes);

const remap = vi.hoisted(() => ({
  loadRemapState: vi.fn(),
  planRemap: vi.fn(),
  applyRemap: vi.fn(),
}));
vi.mock("@/scripts/monday/remap", () => remap);

import { revalidatePath } from "next/cache";

import {
  applyMondayRemapAction,
  connectMondayAction,
  createMondayStaffAction,
  getMondayImportChoicesAction,
  getMondayImportRunAction,
  getMondayRemapAction,
  previewMondayRemapAction,
  saveMondayStatusMapAction,
  startMondayApplyAction,
  startMondayExportAction,
  suggestMondayPositionAction,
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

describe("project flow monday actions", () => {
  const remapInput = [{ boardId: "101", workflowId: ETAPA, groupTargets: { g1: { kind: "admin" as const } } }];
  const statusMap = { "en curso": { target: { customStatusId: STATUS }, priority: "alta" as const } };

  it("rejects non-admins on every new action without touching anything", async () => {
    session.value = { status: "active", user: { id: "u", email: "u@cincel.mx", access: "Dirección" } };
    const forbidden = { ok: false, error: "Solo un Administrador puede importar de monday." };
    expect(await getMondayImportChoicesAction()).toEqual(forbidden);
    expect(await saveMondayStatusMapAction(statusMap)).toEqual(forbidden);
    expect(await createMondayStaffAction(RUN, "7", { positionIds: [POSITION] })).toEqual(forbidden);
    expect(await suggestMondayPositionAction(RUN, "7")).toEqual(forbidden);
    expect(await getMondayRemapAction(PROJECT)).toEqual(forbidden);
    expect(await previewMondayRemapAction(PROJECT, remapInput)).toEqual(forbidden);
    expect(await applyMondayRemapAction(PROJECT, remapInput)).toEqual(forbidden);
    expect(service.saveStatusMap).not.toHaveBeenCalled();
    expect(service.suggestPosition).not.toHaveBeenCalled();
    expect(writes.createStaffWithPositions).not.toHaveBeenCalled();
    expect(remap.loadRemapState).not.toHaveBeenCalled();
    expect(remap.planRemap).not.toHaveBeenCalled();
    expect(remap.applyRemap).not.toHaveBeenCalled();
  });

  it("rejects the bootstrap admin on the remap and the status map", async () => {
    session.value = { status: "active", user: { id: "b", email: "boot@cincel.mx", access: "Administrador" } };
    expect((await applyMondayRemapAction(PROJECT, remapInput)).ok).toBe(false);
    expect((await saveMondayStatusMapAction(statusMap)).ok).toBe(false);
    expect(remap.applyRemap).not.toHaveBeenCalled();
    expect(service.saveStatusMap).not.toHaveBeenCalled();
  });

  describe("saveMondayStatusMapAction", () => {
    it("saves the whole map and revalidates no route (the wizard updates monday.choices)", async () => {
      const result = await saveMondayStatusMapAction(statusMap);
      expect(result).toEqual({ ok: true, statusMap });
      expect(service.saveStatusMap).toHaveBeenCalledWith(expect.anything(), statusMap);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("fills a missing priority with null", async () => {
      const result = await saveMondayStatusMapAction({ listo: { target: { status: "completado" } } } as never);
      expect(result).toEqual({ ok: true, statusMap: { listo: { target: { status: "completado" }, priority: null } } });
    });

    it("answers STATUS_NOT_FOUND when a custom status no longer exists, and saves nothing", async () => {
      writes.statusMapStatusesExist.mockResolvedValueOnce(false);
      expect(await saveMondayStatusMapAction(statusMap)).toEqual({ ok: false, error: "STATUS_NOT_FOUND" });
      expect(service.saveStatusMap).not.toHaveBeenCalled();
    });

    it("refuses a malformed map", async () => {
      const result = await saveMondayStatusMapAction({ x: { target: { customStatusId: "nope" } } } as never);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.error).toMatch(/^INVALID: statusMap/);
      expect(service.saveStatusMap).not.toHaveBeenCalled();
    });
  });

  describe("createMondayStaffAction", () => {
    const user = { id: "7", name: "Ana", email: "ana@cincel.mx", kind: null };

    it("creates the person with the chosen puestos and records them on the run", async () => {
      service.getExportSource.mockResolvedValueOnce({ users: [user] });
      writes.createStaffWithPositions.mockResolvedValueOnce({ id: "s1", name: "Ana", email: "ana@cincel.mx" });
      const result = await createMondayStaffAction(RUN, "7", { positionIds: [POSITION] });
      expect(result).toEqual({ ok: true, staff: { id: "s1", name: "Ana", email: "ana@cincel.mx" } });
      expect(writes.createStaffWithPositions).toHaveBeenCalledWith(expect.anything(), user, [POSITION]);
      expect(service.recordCreatedStaff).toHaveBeenCalledWith(RUN, "s1", expect.anything());
    });

    it("creates without puestos when none are given", async () => {
      service.getExportSource.mockResolvedValueOnce({ users: [user] });
      writes.createStaffWithPositions.mockResolvedValueOnce({ id: "s1", name: "Ana", email: null });
      await createMondayStaffAction(RUN, "7");
      expect(writes.createStaffWithPositions).toHaveBeenCalledWith(expect.anything(), user, []);
    });

    it("refuses puesto ids that aren't uuids before reading the export", async () => {
      const result = await createMondayStaffAction(RUN, "7", { positionIds: ["x"] });
      expect(result).toEqual({ ok: false, error: "INVALID: positionIds.0" });
      expect(service.getExportSource).not.toHaveBeenCalled();
    });
  });

  describe("suggestMondayPositionAction", () => {
    it("returns the suggestion for the person", async () => {
      const suggestion = { position: { id: POSITION, name: "Diseñador" }, tasks: 4, topPhases: [] };
      service.suggestPosition.mockResolvedValueOnce(suggestion);
      expect(await suggestMondayPositionAction(RUN, "7")).toEqual({ ok: true, suggestion });
      expect(service.suggestPosition).toHaveBeenCalledWith(RUN, "7", expect.anything());
    });

    it("rejects anything but a run id", async () => {
      expect(await suggestMondayPositionAction("../x", "7")).toEqual({ ok: false, error: "No se encontró esta importación." });
      expect(service.suggestPosition).not.toHaveBeenCalled();
    });
  });

  describe("remap", () => {
    it("returns the remap state", async () => {
      const state = { project: { id: PROJECT, name: "Madrid 22" }, boards: [], choices: {} };
      remap.loadRemapState.mockResolvedValueOnce(state);
      expect(await getMondayRemapAction(PROJECT)).toEqual({ ok: true, remap: state });
      expect(remap.loadRemapState).toHaveBeenCalledWith(expect.anything(), PROJECT);
    });

    it("answers NOT_IMPORTED and EXPORT_MISSING as codes", async () => {
      remap.loadRemapState.mockRejectedValueOnce(new Error("NOT_IMPORTED"));
      expect(await getMondayRemapAction(PROJECT)).toEqual({ ok: false, error: "NOT_IMPORTED" });
      remap.loadRemapState.mockRejectedValueOnce(new Error("EXPORT_MISSING"));
      expect(await getMondayRemapAction(PROJECT)).toEqual({ ok: false, error: "EXPORT_MISSING" });
      remap.planRemap.mockRejectedValueOnce(new Error("EXPORT_MISSING"));
      expect(await previewMondayRemapAction(PROJECT, remapInput)).toEqual({ ok: false, error: "EXPORT_MISSING" });
    });

    it("refuses a malformed project id before any query", async () => {
      expect(await getMondayRemapAction("1; drop table")).toEqual({ ok: false, error: "INVALID: projectId" });
      expect(remap.loadRemapState).not.toHaveBeenCalled();
    });

    it("previews without writing", async () => {
      const preview = { tasks: 3, changes: {}, samples: [], issues: [] };
      remap.planRemap.mockResolvedValueOnce({ preview, changes: [{ taskId: "t" }] });
      expect(await previewMondayRemapAction(PROJECT, remapInput)).toEqual({ ok: true, preview });
      expect(remap.planRemap).toHaveBeenCalledWith(expect.anything(), PROJECT, remapInput);
      expect(remap.applyRemap).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("refuses an unknown group target", async () => {
      const bad = [{ boardId: "101", workflowId: null, groupTargets: { g1: { kind: "area" } } }];
      const result = await previewMondayRemapAction(PROJECT, bad as never);
      expect(!result.ok && result.error).toMatch(/^INVALID: input\.0\.groupTargets/);
      expect(remap.planRemap).not.toHaveBeenCalled();
    });

    it("applies as the signed-in admin, with no Proyectos, ficha, Tareas or Inicio route revalidated", async () => {
      remap.applyRemap.mockResolvedValueOnce({ updated: 12 });
      expect(await applyMondayRemapAction(PROJECT, remapInput)).toEqual({ ok: true, updated: 12 });
      expect(remap.applyRemap).toHaveBeenCalledWith(expect.anything(), PROJECT, remapInput, "admin");
      // The ficha reads its own query (5b, #960): it is not revalidated.
      expect(revalidatePath).not.toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
      // Tareas reads `qk.tareas.*` (Phase 4): the Actividades layout stub is not revalidated.
      expect(revalidatePath).not.toHaveBeenCalledWith("/actividades", "layout");
      // `/proyectos` reads `qk.proyectos.list()` (5a, #959).
      expect(revalidatePath).not.toHaveBeenCalledWith("/proyectos");
      // Inicio reads `qk.inicio()` (#937): the `/dashboard` stub is not revalidated.
      expect(revalidatePath).not.toHaveBeenCalledWith("/dashboard");
    });

    it("is idempotent: the same input applied twice reaches the core with the same arguments and the second changes nothing", async () => {
      remap.applyRemap.mockResolvedValueOnce({ updated: 12 }).mockResolvedValueOnce({ updated: 0 });
      expect(await applyMondayRemapAction(PROJECT, remapInput)).toEqual({ ok: true, updated: 12 });
      expect(await applyMondayRemapAction(PROJECT, remapInput)).toEqual({ ok: true, updated: 0 });
      expect(remap.applyRemap.mock.calls[0]).toEqual(remap.applyRemap.mock.calls[1]);
    });

    it("answers PROJECT_NAME_TAKEN from apply as a code", async () => {
      remap.applyRemap.mockRejectedValueOnce(new Error("PROJECT_NAME_TAKEN"));
      expect(await applyMondayRemapAction(PROJECT, remapInput)).toEqual({ ok: false, error: "PROJECT_NAME_TAKEN" });
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });
});
