import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Ajustes catalog mutations (Query Migration 9b, #964) return
 * `ActionResult`, so their codes survive production builds: estatus,
 * puestos, and the etapas templates, fases and auto start.
 */

const viewer = vi.hoisted(() => ({ access: "Administrador" as string }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: "actor-1" }, access: viewer.access })),
}));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const statusesRepo = vi.hoisted(() => ({
  listTaskStatuses: vi.fn(),
  createTaskStatus: vi.fn(),
  updateTaskStatus: vi.fn(),
  softDeleteTaskStatus: vi.fn(),
}));
vi.mock("@/lib/repositories/task-statuses-repository", () => statusesRepo);

const positionsRepo = vi.hoisted(() => ({
  listPositions: vi.fn(),
  createPosition: vi.fn(),
  updatePosition: vi.fn(),
  softDeletePosition: vi.fn(),
  setPositionPhases: vi.fn(),
  reorderPositions: vi.fn(),
}));
vi.mock("@/lib/repositories/positions-repository", () => positionsRepo);

const workflowsRepo = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deactivateTemplate: vi.fn(),
  reorderTemplates: vi.fn(),
  setWorkflowAutoStart: vi.fn(),
}));
vi.mock("@/lib/repositories/workflows-repository", () => workflowsRepo);

const phasesRepo = vi.hoisted(() => ({ createPhase: vi.fn(), updatePhase: vi.fn(), reorderPhases: vi.fn() }));
vi.mock("@/lib/repositories/workflow-phases-repository", () => phasesRepo);

import {
  createPositionAction,
  deletePositionAction,
  reorderPositionsAction,
  setPositionPhasesAction,
  updatePositionAction,
} from "@/lib/actions/positions-actions";
import {
  createTaskStatusAction,
  deleteTaskStatusAction,
  updateTaskStatusAction,
} from "@/lib/actions/task-statuses-actions";
import {
  createTemplateAction,
  createWorkflowPhaseAction,
  deactivateTemplateAction,
  reorderTemplatesAction,
  reorderWorkflowPhasesAction,
  setWorkflowAutoStartAction,
  updateTemplateAction,
  updateWorkflowPhaseAction,
} from "@/lib/actions/workflows-actions";

const W = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const F = "33333333-3333-4333-8333-333333333333";
const T = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  viewer.access = "Administrador";
});

describe("task status mutations", () => {
  it("returns { ok: true, data } with the saved status", async () => {
    const row = { id: "s1", name: "Revisión", closes: false, countsAsCompleted: false, sortOrder: 0 };
    statusesRepo.createTaskStatus.mockResolvedValue(row);
    await expect(createTaskStatusAction({ name: "Revisión", closes: false })).resolves.toEqual({ ok: true, data: row });
  });

  it("returns the repository code instead of throwing", async () => {
    statusesRepo.createTaskStatus.mockRejectedValue(new Error("TASK_STATUS_NAME_TAKEN"));
    await expect(createTaskStatusAction({ name: "Revisión", closes: false })).resolves.toEqual({
      ok: false,
      error: "TASK_STATUS_NAME_TAKEN",
    });
  });

  it("returns FORBIDDEN for a viewer without canManageTaskStatuses", async () => {
    viewer.access = "Colaborador";
    await expect(updateTaskStatusAction("s1", { name: "Otro" })).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/^FORBIDDEN/),
    });
    await expect(deleteTaskStatusAction("s1")).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/^FORBIDDEN/),
    });
    expect(statusesRepo.softDeleteTaskStatus).not.toHaveBeenCalled();
  });

  it("no longer revalidates the Ajustes stub route", async () => {
    statusesRepo.softDeleteTaskStatus.mockResolvedValue(undefined);
    await expect(deleteTaskStatusAction("s1")).resolves.toEqual({ ok: true, data: undefined });
    expect(revalidatePath).not.toHaveBeenCalledWith("/configuracion/estatus");
  });
});

describe("puesto mutations", () => {
  it("return the codes as results", async () => {
    viewer.access = "Colaborador";
    for (const run of [
      () => createPositionAction({ name: "Residente" }),
      () => updatePositionAction(P, { name: "Residente" }),
      () => deletePositionAction(P),
      () => setPositionPhasesAction(P, [F]),
      () => reorderPositionsAction([P]),
    ]) {
      await expect(run()).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/^FORBIDDEN/) });
    }
    expect(positionsRepo.createPosition).not.toHaveBeenCalled();
  });

  it("IN_USE comes back as a result", async () => {
    positionsRepo.softDeletePosition.mockRejectedValue(new Error("IN_USE"));
    await expect(deletePositionAction(P)).resolves.toEqual({ ok: false, error: "IN_USE" });
  });

  it("returns the saved puesto", async () => {
    const row = { id: P, name: "Residente" };
    positionsRepo.createPosition.mockResolvedValue(row);
    await expect(createPositionAction({ name: "Residente" })).resolves.toEqual({ ok: true, data: row });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("etapas mutations", () => {
  it("return FORBIDDEN as a result without canManageWorkflows", async () => {
    viewer.access = "Colaborador";
    for (const run of [
      () => createTemplateAction(W, { phaseId: F, title: "Planos" }),
      () => updateTemplateAction(T, { title: "Planos" }),
      () => deactivateTemplateAction(T),
      () => reorderTemplatesAction(W, [T]),
      () => createWorkflowPhaseAction(W, { name: "Cobro" }),
      () => updateWorkflowPhaseAction(F, { name: "Cobro" }),
      () => reorderWorkflowPhasesAction(W, [F]),
      () => setWorkflowAutoStartAction(W, true),
    ]) {
      await expect(run()).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/^FORBIDDEN/) });
    }
  });

  it("keeps NAME_TAKEN for the copy table (etapasErrorText)", async () => {
    phasesRepo.createPhase.mockRejectedValue(new Error("NAME_TAKEN"));
    await expect(createWorkflowPhaseAction(W, { name: "Cobro" })).resolves.toEqual({ ok: false, error: "NAME_TAKEN" });
  });

  it("returns INVALID for a bad id", async () => {
    await expect(reorderWorkflowPhasesAction("nope", [F])).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/^INVALID/),
    });
  });

  it("returns the saved fase and revalidates nothing", async () => {
    const row = { id: F, workflowId: W, name: "Cobro" };
    phasesRepo.createPhase.mockResolvedValue(row);
    await expect(createWorkflowPhaseAction(W, { name: "Cobro" })).resolves.toEqual({ ok: true, data: row });
    // Ajustes › Etapas and Puestos read through TanStack Query; Tareas reads `qk.tareas.*` (Phase 4).
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
